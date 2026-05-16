import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { Recipient } from './entities/recipient.entity';
import { CreateRecipientDto } from './dto/create-recipient.dto';

@Injectable()
export class RecipientsService {
  constructor(
    @InjectRepository(Recipient)
    private readonly recipientRepo: Repository<Recipient>,
  ) {}

  async create(userId: string, dto: CreateRecipientDto): Promise<Recipient> {
    const recipient = this.recipientRepo.create({
      user_id: userId,
      name: dto.name,
      country: dto.country.toUpperCase(),
      mobile_money_type: dto.mobile_money_type,
      account_number: dto.account_number,
    });

    try {
      return await this.recipientRepo.save(recipient);
    } catch (err) {
      // Catch unique constraint violation (user_id + account_number + mobile_money_type)
      if (
        err instanceof QueryFailedError &&
        (err as any).code === '23505'
      ) {
        throw new ConflictException(
          'A recipient with this account number and mobile money type already exists',
        );
      }
      throw err;
    }
  }

  async findAll(userId: string): Promise<Recipient[]> {
    return this.recipientRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(userId: string, recipientId: string): Promise<Recipient | null> {
    return this.recipientRepo.findOne({
      where: { id: recipientId, user_id: userId },
    });
  }
}
