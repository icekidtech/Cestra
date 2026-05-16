import {
  Injectable,
  ForbiddenException,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { KycDto } from './dto/kyc.dto';

export interface KycSessionResponse {
  session_url: string;
  tier: number;
}

export interface PersonaWebhookPayload {
  data: {
    attributes: {
      status: 'approved' | 'declined' | 'needs_review';
      reference_id: string; // user ID
      fields?: {
        tier?: { value: number };
      };
    };
  };
  meta?: {
    tier?: number;
  };
}

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Initiates a Persona KYC verification session for the given tier.
   * Enforces tier progression — a user cannot skip tiers.
   */
  async initiate(userId: string, dto: KycDto): Promise<KycSessionResponse> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const requestedTier = dto.tier;

    // Enforce tier progression: cannot skip tiers (Requirement 4.2)
    if (requestedTier > user.kyc_tier + 1) {
      throw new ForbiddenException(
        `You must complete Tier ${user.kyc_tier + 1} before requesting Tier ${requestedTier}`,
      );
    }

    // Call Persona API to create a verification session
    const sessionUrl = await this.createPersonaSession(userId, requestedTier);

    return { session_url: sessionUrl, tier: requestedTier };
  }

  /**
   * Handles Persona webhook callbacks to update KYC tier on approval.
   * Called by POST /v1/auth/kyc/webhook (no auth required).
   */
  async handleWebhook(payload: PersonaWebhookPayload): Promise<void> {
    const { status, reference_id } = payload.data.attributes;

    if (status !== 'approved') {
      // Only update tier on approval; declined/needs_review require no action here
      return;
    }

    const user = await this.userRepo.findOne({ where: { id: reference_id } });
    if (!user) {
      // Webhook for unknown user — ignore gracefully
      return;
    }

    // Advance KYC tier by 1 on approval
    const newTier = Math.min(user.kyc_tier + 1, 3) as 0 | 1 | 2 | 3;
    await this.userRepo.update(user.id, { kyc_tier: newTier });
  }

  /**
   * Creates a Persona verification session via the Persona API.
   * Returns the hosted session URL for the user to complete verification.
   */
  private async createPersonaSession(userId: string, tier: number): Promise<string> {
    const apiKey = this.config.get<string>('PERSONA_API_KEY');

    // Persona template IDs per tier — configure these in your Persona dashboard
    const templateIds: Record<number, string> = {
      1: 'itmpl_tier1_email_verification',
      2: 'itmpl_tier2_government_id',
      3: 'itmpl_tier3_enhanced_due_diligence',
    };

    const templateId = templateIds[tier];

    try {
      const response = await fetch('https://withpersona.com/api/v1/inquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Persona-Version': '2023-01-05',
        },
        body: JSON.stringify({
          data: {
            attributes: {
              'inquiry-template-id': templateId,
              'reference-id': userId,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new BadGatewayException('KYC service temporarily unavailable');
      }

      const data = (await response.json()) as {
        data: { attributes: { 'session-token': string } };
      };
      const sessionToken = data.data.attributes['session-token'];
      return `https://withpersona.com/verify?inquiry-id=${sessionToken}`;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException('KYC service temporarily unavailable');
    }
  }
}
