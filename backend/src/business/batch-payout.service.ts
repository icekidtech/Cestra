import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchPayout } from './entities/batch-payout.entity';
import { CsvRow, CsvRowError } from './dto/batch-payout.dto';

const REQUIRED_COLUMNS = [
  'Recipient Name',
  'Country',
  'Mobile Money Type',
  'Account Number',
  'Amount (USD)',
] as const;

const MAX_BATCH_SIZE = 100;

@Injectable()
export class BatchPayoutService {
  constructor(
    @InjectRepository(BatchPayout)
    private readonly batchRepo: Repository<BatchPayout>,
  ) {}

  async processBatchPayout(businessId: string, csvBuffer: Buffer) {
    const rows = this.parseCsv(csvBuffer);

    // Reject if > 100 rows 
    if (rows.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `CSV contains ${rows.length} rows. Maximum batch size is ${MAX_BATCH_SIZE}.`,
      );
    }

    // Validate all rows before executing any payouts
    const errors: CsvRowError[] = [];
    for (let i = 0; i < rows.length; i++) {
      const rowErrors = this.validateRow(rows[i], i + 2); // +2 for header row + 1-indexed
      if (rowErrors.errors.length > 0) errors.push(rowErrors);
    }

    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        message: 'CSV validation failed. No payouts were executed.',
        errors,
      });
    }

    // Calculate totals
    const totalAmount = rows.reduce((sum, r) => sum + parseFloat(r['Amount (USD)']), 0);
    const totalFee = parseFloat((totalAmount * 0.008).toFixed(6));

    // Create batch record
    const batch = this.batchRepo.create({
      business_id: businessId,
      total_amount: totalAmount.toFixed(6),
      total_fee: totalFee.toFixed(6),
      success_count: 0,
      fail_count: 0,
      status: 'PROCESSING',
    });
    await this.batchRepo.save(batch);

    // TODO: Enqueue individual payouts via a job queue (BullMQ)
    // For now, simulate async processing
    void this.processPayouts(batch.id, rows);

    return {
      batch_id: batch.id,
      status: 'PROCESSING',
      total_recipients: rows.length,
      total_amount: totalAmount,
      total_fee: totalFee,
    };
  }

  private parseCsv(buffer: Buffer): CsvRow[] {
    const text = buffer.toString('utf8');
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      rows.push(row as unknown as CsvRow);
    }

    return rows;
  }

  private validateRow(row: CsvRow, rowNumber: number): CsvRowError {
    const errors: string[] = [];

    for (const col of REQUIRED_COLUMNS) {
      if (!row[col] || row[col].trim() === '') {
        errors.push(`Column "${col}" is required`);
      }
    }

    const amount = parseFloat(row['Amount (USD)']);
    if (isNaN(amount) || amount <= 0) {
      errors.push('"Amount (USD)" must be a positive number');
    }

    return { row: rowNumber, errors };
  }

  private async processPayouts(batchId: string, rows: CsvRow[]): Promise<void> {
    // TODO: Process each row as an individual send transaction
    // Update success_count / fail_count as each resolves
    // Fire batch.completed webhook when all done
    let successCount = 0;
    let failCount = 0;

    for (const _row of rows) {
      // Stub: mark all as success for now
      successCount++;
    }

    await this.batchRepo.update(batchId, {
      success_count: successCount,
      fail_count: failCount,
      status: failCount === rows.length ? 'FAILED' : 'COMPLETED',
    });
  }
}
