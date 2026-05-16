import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Business } from './entities/business.entity';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
  ) {}

  /**
   * Creates a new business account with a hashed API key.
   * Returns the plaintext key ONCE — it is not stored and cannot be recovered.
   */
  async createApiKey(name: string): Promise<{ business: Business; plaintextKey: string }> {
    const plaintextKey = randomBytes(32).toString('hex'); // 64-char hex key
    const saltRounds = 10;
    const api_key_hash = await bcrypt.hash(plaintextKey, saltRounds);

    const business = this.businessRepo.create({ name, api_key_hash });
    await this.businessRepo.save(business);

    return { business, plaintextKey };
  }

  /**
   * Validates a plaintext API key against all stored bcrypt hashes.
   * Returns the matching Business or null if no match found.
   */
  async validateApiKey(plaintextKey: string): Promise<Business | null> {
    const businesses = await this.businessRepo.find();
    for (const business of businesses) {
      const match = await bcrypt.compare(plaintextKey, business.api_key_hash);
      if (match) {
        return business;
      }
    }
    return null;
  }
}
