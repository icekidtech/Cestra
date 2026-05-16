import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Invoice } from './entities/invoice.entity';
import { CreateInvoiceDto } from './dto/invoice.dto';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly config: ConfigService,
  ) {}

  async createInvoice(businessId: string, dto: CreateInvoiceDto) {
    // Reject if due_date is in the past
    const dueDate = new Date(dto.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dueDate < today) {
      throw new BadRequestException('due_date must be today or a future date');
    }

    const invoice = this.invoiceRepo.create({
      business_id: businessId,
      amount: dto.amount.toFixed(6),
      reference: dto.reference,
      due_date: dto.due_date,
      status: 'PENDING',
    });
    await this.invoiceRepo.save(invoice);

    // Generate hosted payment URL from APP_BASE_URL env var
    const baseUrl = this.config.get<string>('APP_BASE_URL');
    const paymentUrl = `${baseUrl}/v1/invoices/${invoice.id}/pay`;

    return {
      invoice_id: invoice.id,
      payment_url: paymentUrl,
      amount: dto.amount,
      reference: dto.reference,
      due_date: dto.due_date,
      status: 'PENDING',
    };
  }

  async markPaid(invoiceId: string, txId: string): Promise<void> {
    const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    await this.invoiceRepo.update(invoiceId, {
      status: 'PAID',
      payment_tx_id: txId,
    });
    // TODO: fire invoice.paid webhook
  }
}
