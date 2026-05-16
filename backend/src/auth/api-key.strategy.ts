import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Business } from '../business/entities/business.entity';
import { Request } from 'express';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
  ) {
    super();
  }

  async validate(request: Request): Promise<Business> {
    const apiKey = request.headers['x-api-key'] as string;
    if (!apiKey) {
      throw new UnauthorizedException('X-API-Key header is required');
    }

    const businesses = await this.businessRepo.find();
    for (const business of businesses) {
      const match = await bcrypt.compare(apiKey, business.api_key_hash);
      if (match) {
        return business;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }
}
