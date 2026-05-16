import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac } from 'crypto';
import { Business } from './entities/business.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';

const RETRY_DELAYS_MS = [30_000, 300_000, 1_800_000]; // 30s, 5m, 30m

@Injectable()
export class WebhookService {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
  ) {}

  /**
   * Delivers a webhook event to the business's registered endpoint.
   * Signs the payload with HMAC-SHA256 
   * Retries on failure with exponential backoff
   */
  async deliver(
    businessId: string,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business?.webhook_url) return; // No webhook registered — skip

    // Create delivery record
    const delivery = this.deliveryRepo.create({
      business_id: businessId,
      event_type: eventType,
      payload,
      status: 'PENDING',
      attempts: 0,
    });
    await this.deliveryRepo.save(delivery);

    // Attempt delivery asynchronously
    void this.attemptDelivery(delivery, business, 0);
  }

  /**
   * Registers a webhook URL for a business.
   * Validates reachability by sending a ping event (Requirement 15.5).
   */
  async registerWebhook(businessId: string, webhookUrl: string): Promise<void> {
    // Send ping to validate URL
    const pingPayload = { event: 'ping', timestamp: new Date().toISOString() };
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');

    // Temporarily set the URL to test it
    const secret = business.webhook_secret ?? this.generateSecret();
    const signature = this.sign(pingPayload, secret);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cestra-Signature': signature,
      },
      body: JSON.stringify(pingPayload),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!response || !response.ok) {
      throw new Error(`Webhook URL is not reachable: ${webhookUrl}`);
    }

    await this.businessRepo.update(businessId, {
      webhook_url: webhookUrl,
      webhook_secret: secret,
    });
  }

  /**
   * Lists registered webhook endpoints for a business (Requirement 15.6).
   */
  async listWebhooks(businessId: string) {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) return [];

    return business.webhook_url
      ? [{ url: business.webhook_url, registered: true }]
      : [];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async attemptDelivery(
    delivery: WebhookDelivery,
    business: Business,
    attemptIndex: number,
  ): Promise<void> {
    const signature = this.sign(delivery.payload, business.webhook_secret ?? '');

    try {
      const response = await fetch(business.webhook_url!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cestra-Signature': signature,
        },
        body: JSON.stringify(delivery.payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        await this.deliveryRepo.update(delivery.id, {
          status: 'DELIVERED',
          attempts: delivery.attempts + 1,
          last_attempted_at: new Date(),
        });
        return;
      }
    } catch {
      // Network error — fall through to retry
    }

    // Update attempt count
    const newAttempts = delivery.attempts + 1;
    await this.deliveryRepo.update(delivery.id, {
      attempts: newAttempts,
      last_attempted_at: new Date(),
    });

    // Schedule retry if attempts remain
    if (attemptIndex < RETRY_DELAYS_MS.length) {
      setTimeout(() => {
        void this.attemptDelivery(
          { ...delivery, attempts: newAttempts },
          business,
          attemptIndex + 1,
        );
      }, RETRY_DELAYS_MS[attemptIndex]);
    } else {
      await this.deliveryRepo.update(delivery.id, { status: 'FAILED' });
    }
  }

  private sign(payload: Record<string, any>, secret: string): string {
    return createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private generateSecret(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }
}
