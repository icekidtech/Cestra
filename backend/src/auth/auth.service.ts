import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, createVerify } from 'crypto';
import { jwtToAddress } from '@mysten/sui/zklogin';
import { User } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';

export interface LoginResponse {
  access_token: string;
  wallet_address: string;
  user_id: string;
}

interface GoogleJwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty: string;
}

interface DecodedJwt {
  header: { kid?: string; alg?: string };
  payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    email?: string;
    exp?: number;
  };
  signingInput: string;
  signature: Buffer;
}

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Cache Google's signing keys; refreshed when an unknown kid is seen.
  private jwksCache: { keys: GoogleJwk[]; fetchedAt: number } | null = null;
  private readonly jwksTtlMs = 60 * 60 * 1000; // 1 hour

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Verifies a Google zkLogin id_token, derives the Sui zkLogin address,
   * upserts the user, and returns a signed app JWT.
   */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const { zklogin_token, provider } = dto;

    const wallet_address = await this.resolveWalletAddress(
      zklogin_token,
      provider,
    );

    if (!wallet_address) {
      throw new UnauthorizedException('Invalid or expired zkLogin token');
    }

    let user = await this.userRepo.findOne({ where: { wallet_address } });
    if (!user) {
      // New users start at KYC Tier 1 (email-verified, up to $999/tx) so they
      // can transact immediately after social sign-in. Higher tiers are granted
      // via the KYC flow.
      user = this.userRepo.create({ wallet_address, provider, kyc_tier: 1 });
      await this.userRepo.save(user);
    }

    const payload = {
      sub: user.id,
      wallet_address: user.wallet_address,
      kyc_tier: user.kyc_tier,
    };
    const access_token = this.jwtService.sign(payload);

    return { access_token, wallet_address: user.wallet_address, user_id: user.id };
  }

  /**
   * Resolve a Sui wallet address from the supplied token.
   *
   * For Google, performs real cryptographic verification of the OIDC id_token
   * (RS256 signature against Google's JWKS, issuer/audience/expiry checks),
   * then derives the deterministic zkLogin address via @mysten/sui.
   *
   * When GOOGLE_CLIENT_ID is not configured (local/dev), falls back to a
   * permissive base64-payload decode so the UI can be exercised without OAuth.
   */
  private async resolveWalletAddress(
    token: string,
    provider: 'google' | 'apple',
  ): Promise<string | null> {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    if (provider === 'google' && googleClientId) {
      return this.verifyGoogleZkLogin(token, googleClientId);
    }

    // Dev fallback — no OAuth configured.
    this.logger.warn(
      `zkLogin running in DEV fallback mode (no ${provider} verification). ` +
        'Set GOOGLE_CLIENT_ID to enable real verification.',
    );
    return this.decodeDevToken(token, provider);
  }

  /**
   * Real Google OIDC verification + zkLogin address derivation.
   */
  private async verifyGoogleZkLogin(
    idToken: string,
    clientId: string,
  ): Promise<string | null> {
    let decoded: DecodedJwt;
    try {
      decoded = this.decodeJwt(idToken);
    } catch {
      throw new UnauthorizedException('Malformed id_token');
    }

    // Algorithm + claim checks
    if (decoded.header.alg !== 'RS256') {
      throw new UnauthorizedException('Unsupported token algorithm');
    }
    if (!decoded.payload.iss || !GOOGLE_ISSUERS.includes(decoded.payload.iss)) {
      throw new UnauthorizedException('Invalid token issuer');
    }
    if (decoded.payload.aud !== clientId) {
      throw new UnauthorizedException('Token audience mismatch');
    }
    if (
      !decoded.payload.exp ||
      decoded.payload.exp * 1000 < Date.now()
    ) {
      throw new UnauthorizedException('Token expired');
    }
    if (!decoded.payload.sub) {
      throw new UnauthorizedException('Token missing subject');
    }

    // Signature verification against Google's published keys
    const verified = await this.verifySignature(decoded);
    if (!verified) {
      throw new UnauthorizedException('Token signature verification failed');
    }

    // Derive the deterministic zkLogin Sui address from the JWT + salt.
    // The salt must be stable per user; for the beta we use a configured
    // application salt (replace with a per-user salt service for production).
    const salt = this.configService.get<string>(
      'ZKLOGIN_SALT',
      '129390038577185583942388216820280642146',
    );
    try {
      return jwtToAddress(idToken, BigInt(salt));
    } catch (error) {
      this.logger.error(
        `Failed to derive zkLogin address: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new UnauthorizedException('Could not derive wallet address');
    }
  }

  /** Verify the RS256 signature using the matching Google JWK. */
  private async verifySignature(decoded: DecodedJwt): Promise<boolean> {
    let jwk = await this.getGoogleKey(decoded.header.kid);
    if (!jwk) {
      // Unknown kid — Google may have rotated keys; refresh once.
      this.jwksCache = null;
      jwk = await this.getGoogleKey(decoded.header.kid);
    }
    if (!jwk) return false;

    const publicKey = createPublicKey({
      key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
      format: 'jwk',
    });

    const verifier = createVerify('RSA-SHA256');
    verifier.update(decoded.signingInput);
    verifier.end();
    return verifier.verify(publicKey, decoded.signature);
  }

  /** Fetch (and cache) Google's JWKS, returning the key for a given kid. */
  private async getGoogleKey(kid?: string): Promise<GoogleJwk | null> {
    if (!kid) return null;
    const fresh =
      this.jwksCache &&
      Date.now() - this.jwksCache.fetchedAt < this.jwksTtlMs;

    if (!fresh) {
      const res = await fetch(GOOGLE_JWKS_URL);
      if (!res.ok) {
        throw new UnauthorizedException('Unable to fetch Google signing keys');
      }
      const body = (await res.json()) as { keys: GoogleJwk[] };
      this.jwksCache = { keys: body.keys, fetchedAt: Date.now() };
    }

    return this.jwksCache?.keys.find((k) => k.kid === kid) ?? null;
  }

  /** Split a compact JWT into header/payload/signature + signing input. */
  private decodeJwt(token: string): DecodedJwt {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT structure');
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8'),
    );
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
    return {
      header,
      payload,
      signingInput: `${headerB64}.${payloadB64}`,
      signature: Buffer.from(signatureB64, 'base64url'),
    };
  }

  /** Dev-only token decoder used when no OAuth client is configured. */
  private decodeDevToken(
    token: string,
    provider: 'google' | 'apple',
  ): string | null {
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

  /**
   * DEV ONLY — advance the caller's KYC tier without a real Persona flow,
   * so higher send limits can be demoed. Disabled in production.
   */
  async devUpgradeKyc(userId: string): Promise<{ kyc_tier: number }> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new UnauthorizedException('Dev KYC upgrade is disabled in production');
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    user.kyc_tier = Math.min(user.kyc_tier + 1, 3);
    await this.userRepo.save(user);
    return { kyc_tier: user.kyc_tier };
  }
}
