import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';

export interface LoginResponse {
  access_token: string;
  wallet_address: string;
  user_id: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Verifies a zkLogin token, upserts the user record, and returns a signed JWT.
   * NOTE: Full zkLogin cryptographic verification requires the Sui SDK and JWKS
   * endpoint for the given provider. This implementation validates the token
   * structure and extracts the wallet address. Replace the stub verifier with
   * the real Sui zkLogin verifier before mainnet.
   */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const { zklogin_token, provider } = dto;

    // --- zkLogin verification stub ---
    // In production: call Sui zkLogin verifier with the token and provider JWKS.
    // The verifier returns the derived Sui wallet address from the OAuth proof.
    const wallet_address = await this.verifyZkLoginToken(zklogin_token, provider);

    if (!wallet_address) {
      throw new UnauthorizedException('Invalid or expired zkLogin token');
    }

    // Upsert user — create on first login, retrieve on subsequent logins
    let user = await this.userRepo.findOne({ where: { wallet_address } });
    if (!user) {
      user = this.userRepo.create({ wallet_address, provider, kyc_tier: 0 });
      await this.userRepo.save(user);
    }

    // Sign JWT with 15-minute expiry
    const payload = {
      sub: user.id,
      wallet_address: user.wallet_address,
      kyc_tier: user.kyc_tier,
    };
    const access_token = this.jwtService.sign(payload);

    return { access_token, wallet_address: user.wallet_address, user_id: user.id };
  }

  /**
   * Stub zkLogin token verifier.
   * Replace with real Sui zkLogin verification using @mysten/sui SDK.
   * Returns the derived wallet address on success, null on failure.
   */
  private async verifyZkLoginToken(
    token: string,
    provider: 'google' | 'apple',
  ): Promise<string | null> {
    // TODO: Implement real zkLogin verification
    // import { verifyZkLoginSignature } from '@mysten/sui/zklogin';
    // const result = await verifyZkLoginSignature({ token, provider });
    // return result.walletAddress;

    // Stub: decode the token as a base64 JSON payload for development
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
      if (decoded.wallet_address && decoded.provider === provider) {
        return decoded.wallet_address as string;
      }
      return null;
    } catch {
      return null;
    }
  }
}
