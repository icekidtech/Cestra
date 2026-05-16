import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { Transaction } from '../send/entities/transaction.entity';
import { ListTransactionsDto } from './dto/list-transactions.dto';

export interface PaginatedTransactions {
  items: Transaction[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async findAll(userId: string, query: ListTransactionsDto): Promise<PaginatedTransactions> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: FindManyOptions<Transaction>['where'] = { user_id: userId };
    if (query.type) (where as any).type = query.type;
    if (query.status) (where as any).status = query.status;

    const [items, total] = await this.txRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip,
      take: limit,
      relations: ['recipient'],
    });

    return {
      items: items.map((tx) => ({
        ...tx,
        recipient_name: tx.recipient?.name ?? null,
        amount: parseFloat(tx.amount as any),
        fee: parseFloat(tx.fee as any),
        local_amount: tx.local_amount ? parseFloat(tx.local_amount as any) : null,
      })) as any,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }
}
