import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { KycService, PersonaWebhookPayload } from './kyc.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { KycDto } from './dto/kyc.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly kycService: KycService,
  ) {}

  /**
   * POST /v1/auth/login
   * Authenticate via zkLogin token. Returns JWT + wallet address.
   * No auth required (public endpoint).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /v1/auth/kyc
   * Initiate KYC verification for a specific tier.
   * Requires valid JWT.
   */
  @Post('kyc')
  @UseGuards(JwtAuthGuard)
  @Throttle({ consumer: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async initiateKyc(
    @CurrentUser('id') userId: string,
    @Body() dto: KycDto,
  ) {
    return this.kycService.initiate(userId, dto);
  }

  /**
   * POST /v1/auth/kyc/dev-upgrade — DEV ONLY
   * Advances the caller's KYC tier without Persona. Disabled in production.
   */
  @Post('kyc/dev-upgrade')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async devUpgradeKyc(@CurrentUser('id') userId: string) {
    return this.authService.devUpgradeKyc(userId);
  }

  /**
   * POST /v1/auth/kyc/webhook
   * Persona webhook callback — no auth required.
   * Called by Persona when a KYC session is completed.
   */
  @Post('kyc/webhook')
  @HttpCode(HttpStatus.OK)
  async kycWebhook(@Body() payload: PersonaWebhookPayload) {
    await this.kycService.handleWebhook(payload);
    return { received: true };
  }
}
