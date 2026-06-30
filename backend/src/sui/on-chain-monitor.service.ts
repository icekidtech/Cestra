import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SuiClient } from '@mysten/sui/client';
import { SUI_CLIENT } from './sui.constants';
import { BlockchainConfigService } from './blockchain-config.service';
import { EventEmitter } from 'events';
import * as redis from 'ioredis';

/**
 * OnChainMonitorService subscribes to Sui blockchain events via WebSocket,
 * deduplicates them, and routes to module-specific handlers.
 *
 * Features:
 * - WebSocket subscription to all Cestra module events
 * - Automatic fallback to polling if WebSocket fails
 * - Event deduplication using Redis
 * - Event routing to module-specific handlers
 * - Comprehensive error handling and reconnection logic
 */

export interface ParsedEvent {
  digest: string;
  eventSeq: number;
  packageId: string;
  module: string;
  eventType: string;
  sender?: string;
  parsedJson: Record<string, any>;
  timestamp: number;
}

export enum OnChainEventType {
  SEND_EVENT = 'cestra::send::SentEvent',
  POOL_CREATED = 'cestra::pool::PoolCreatedEvent',
  POOL_CONTRIBUTED = 'cestra::pool::PoolContributedEvent',
  POOL_EXECUTED = 'cestra::pool::PoolExecutedEvent',
  YIELD_DEPOSITED = 'cestra::yield::YieldDepositedEvent',
  YIELD_ACCRUED = 'cestra::yield::YieldAccruedEvent',
  CIRCLE_CREATED = 'cestra::circle::CircleCreatedEvent',
  CIRCLE_PAYOUT_TRIGGERED = 'cestra::circle::CirclePayoutTriggeredEvent',
  RATELOCK_CREATED = 'cestra::ratelock::RateLockCreatedEvent',
  RATELOCK_FILLED = 'cestra::ratelock::RateLockFilledEvent',
  RATELOCK_EXPIRED = 'cestra::ratelock::RateLockExpiredEvent',
  BRIDGE_CCTP_COMPLETED = 'cestra::bridge::BridgeCctpReceiveCompleted',
  BRIDGE_WORMHOLE_COMPLETED = 'cestra::bridge::BridgeWormholeReceiveCompleted',
}

@Injectable()
export class OnChainMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnChainMonitorService.name);
  private readonly eventEmitter = new EventEmitter();
  private redisClient: redis.Redis;
  private wsSubscription: any;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 12; // ~1 minute with exponential backoff
  private pollingActive = false;
  private lastEventSeq = 0;

  // Event types that this service monitors
  private readonly monitoredEventTypes = [
    OnChainEventType.SEND_EVENT,
    OnChainEventType.POOL_CREATED,
    OnChainEventType.POOL_CONTRIBUTED,
    OnChainEventType.POOL_EXECUTED,
    OnChainEventType.YIELD_DEPOSITED,
    OnChainEventType.YIELD_ACCRUED,
    OnChainEventType.CIRCLE_CREATED,
    OnChainEventType.CIRCLE_PAYOUT_TRIGGERED,
    OnChainEventType.RATELOCK_CREATED,
    OnChainEventType.RATELOCK_FILLED,
    OnChainEventType.RATELOCK_EXPIRED,
    OnChainEventType.BRIDGE_CCTP_COMPLETED,
    OnChainEventType.BRIDGE_WORMHOLE_COMPLETED,
  ];

  constructor(
    @Inject(SUI_CLIENT) private suiClient: SuiClient,
    private readonly blockchainConfig: BlockchainConfigService,
  ) {
    this.redisClient = new redis.Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '0'),
    });
  }

  async onModuleInit() {
    this.logger.log('Initializing OnChainMonitorService');

    // Test Redis connection
    try {
      await this.redisClient.ping();
      this.logger.log('Redis connection established');
    } catch (error) {
      this.logger.warn(
        `Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Initialize WebSocket subscription in the background so a slow or
    // unsupported subscription endpoint never blocks application bootstrap
    // (app.listen()). On failure it falls back to RPC polling internally.
    //
    // The Sui public fullnodes have deprecated JSON-RPC event subscriptions,
    // so on those endpoints we go straight to polling. Set SUI_ENABLE_WS=true
    // to attempt a WebSocket subscription against a node that still supports it.
    if (process.env.SUI_ENABLE_WS === 'true') {
      void this.initializeWebSocket();
    } else {
      this.logger.log(
        'WebSocket event subscription disabled (SUI_ENABLE_WS!=true); using RPC polling',
      );
      await this.startPolling();
    }
  }

  async onModuleDestroy() {
    this.logger.log('Destroying OnChainMonitorService');
    await this.disconnect();
    this.redisClient?.disconnect();
  }

  /**
   * Initialize WebSocket subscription to Sui events
   */
  private async initializeWebSocket(): Promise<void> {
    try {
      this.logger.log('Attempting to establish WebSocket subscription');

      // Build filter for all monitored events
      const filter = {
        All: this.monitoredEventTypes.map((eventType) => ({
          MoveEventType: eventType as string,
        })),
      } as any;

      // Subscribe to events. Race against a timeout because some RPC nodes
      // accept the connection but never complete the subscription handshake.
      this.wsSubscription = await Promise.race([
        this.suiClient.subscribeEvent({
          filter,
          onMessage: (event) => this.handleEvent(event),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('subscribeEvent timed out after 10s')),
            10_000,
          ),
        ),
      ]);

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.pollingActive = false;

      this.logger.log(
        'WebSocket subscription established successfully',
      );
    } catch (error) {
      this.logger.warn(
        `WebSocket subscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.isConnected = false;

      // Start fallback polling
      await this.startPolling();
    }
  }

  /**
   * Handle incoming event from WebSocket
   */
  private async handleEvent(event: any): Promise<void> {
    try {
      const parsedEvent = this.parseEvent(event);

      if (!parsedEvent) {
        return; // Event parsing failed
      }

      // Check for duplicate
      const isDuplicate = await this.checkAndMarkDuplicate(parsedEvent);
      if (isDuplicate) {
        this.logger.debug(
          `Duplicate event detected: ${parsedEvent.digest}:${parsedEvent.eventSeq}`,
        );
        return;
      }

      // Route to handler
      this.routeEvent(parsedEvent);
    } catch (error) {
      this.logger.error(
        `Error handling event: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Parse raw Sui event into standardized format
   */
  private parseEvent(rawEvent: any): ParsedEvent | null {
    try {
      const { id, packageId, transactionModule, type, parsedJson, sender } =
        rawEvent;

      if (!id || !id.txDigest || !type) {
        this.logger.warn('Invalid event structure', rawEvent);
        return null;
      }

      return {
        digest: id.txDigest,
        eventSeq: id.eventSeq || 0,
        packageId,
        module: transactionModule,
        eventType: type,
        sender,
        parsedJson: parsedJson || {},
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(
        `Error parsing event: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Check if event is duplicate and mark it in Redis
   */
  private async checkAndMarkDuplicate(
    event: ParsedEvent,
  ): Promise<boolean> {
    try {
      const eventKey = `event:${event.digest}:${event.eventSeq}`;
      const exists = await this.redisClient.exists(eventKey);

      if (exists) {
        return true; // Duplicate
      }

      // Mark as seen and set expiry (1 hour)
      await this.redisClient.setex(eventKey, 3600, '1');

      // Track last event seq for polling
      if (event.eventSeq > this.lastEventSeq) {
        this.lastEventSeq = event.eventSeq;
      }

      return false; // Not a duplicate
    } catch (error) {
      this.logger.error(
        `Error checking duplicate: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false; // Assume not duplicate on error (fail open)
    }
  }

  /**
   * Route event to module-specific handler
   */
  private routeEvent(event: ParsedEvent): void {
    try {
      // Emit to internal event bus
      this.eventEmitter.emit(event.eventType, event);

      // Also emit generic event for debugging
      this.eventEmitter.emit('event', event);

      this.logger.debug(
        `Event routed: ${event.eventType} (digest: ${event.digest})`,
      );
    } catch (error) {
      this.logger.error(
        `Error routing event: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Subscribe to events of a specific type
   */
  public onEvent(
    eventType: string | OnChainEventType,
    handler: (event: ParsedEvent) => Promise<void>,
  ): void {
    this.eventEmitter.on(eventType, (event: ParsedEvent) => {
      handler(event).catch((error) => {
        this.logger.error(
          `Error in event handler for ${eventType}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      });
    });
  }

  /**
   * Start fallback polling
   */
  private async startPolling(): Promise<void> {
    if (this.pollingActive) {
      return; // Already polling
    }

    this.pollingActive = true;
    this.logger.log('Starting fallback polling for events');

    // First poll immediately
    await this.pollEvents();
  }

  /**
   * Resolve a `cestra::module::Event` identifier to its fully-qualified
   * on-chain type using the deployed package ID, e.g.
   * `0x9395…::send::SentEvent`. Sui's `MoveEventType` filter requires the
   * concrete package address, not the named address.
   */
  private resolveEventType(eventType: string): string {
    const packageId = this.blockchainConfig.getPackageId();
    return eventType.replace(/^cestra::/, `${packageId}::`);
  }

  /**
   * Poll for events from Sui RPC.
   *
   * The public Sui fullnodes reject a compound `{ All: [...] }` event filter
   * for `queryEvents` ("Invalid params"). Instead we query each monitored
   * event type with its own `MoveEventType` filter and keep a per-type cursor.
   */
  @Interval(5000) // Every 5 seconds
  private async pollEvents(): Promise<void> {
    if (!this.pollingActive || this.isConnected) {
      return; // Not polling or WebSocket is connected
    }

    for (const eventType of this.monitoredEventTypes) {
      try {
        const fqType = this.resolveEventType(eventType);
        const cursorKey = `event:polling:cursor:${eventType}`;
        const cursorRaw = await this.getPollingCursor(cursorKey);
        const cursor = cursorRaw ? JSON.parse(cursorRaw) : null;

        const response = await this.suiClient.queryEvents({
          query: { MoveEventType: fqType },
          cursor,
          limit: 50,
          order: 'ascending',
        });

        if (response.data && response.data.length > 0) {
          this.logger.debug(
            `Polled ${response.data.length} ${eventType} event(s)`,
          );
          for (const event of response.data) {
            await this.handleEvent(event);
          }
          if (response.nextCursor) {
            await this.savePollingCursor(
              JSON.stringify(response.nextCursor),
              cursorKey,
            );
          }
        }
      } catch (error) {
        // A missing event type (never emitted yet) yields an empty result on
        // most nodes; only log genuine errors at debug to avoid log spam.
        this.logger.debug(
          `Polling ${eventType}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  // Legacy combined-poll error handling retained below for reference; the
  // per-type loop above supersedes it.
  private async pollEventsLegacy(): Promise<void> {
    if (!this.pollingActive || this.isConnected) {
      return;
    }

    try {
      const cursorRaw = await this.getPollingCursor();
      const cursor = cursorRaw ? JSON.parse(cursorRaw) : null;

      const response = await this.suiClient.queryEvents({
        query: {
          All: this.monitoredEventTypes.map((eventType) => ({
            MoveEventType: eventType as string,
          })),
        } as any,
        cursor,
        limit: 100,
        order: 'ascending',
      });

      if (response.data && response.data.length > 0) {
        this.logger.debug(`Polled ${response.data.length} events`);

        for (const event of response.data) {
          await this.handleEvent(event);
        }

        // Update cursor
        if (response.nextCursor) {
          await this.savePollingCursor(JSON.stringify(response.nextCursor));
        }
      }
    } catch (error) {
      this.logger.warn(
        `Error polling events: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      // Check if we should attempt WebSocket reconnection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);

        this.logger.log(
          `Attempting WebSocket reconnection (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${backoffMs}ms`,
        );

        setTimeout(() => {
          this.initializeWebSocket();
        }, backoffMs);
      }
    }
  }

  /**
   * Get last polling cursor from Redis
   */
  private async getPollingCursor(
    key = 'event:polling:cursor',
  ): Promise<string | null> {
    try {
      return await this.redisClient.get(key);
    } catch (error) {
      this.logger.warn(
        `Error getting polling cursor: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Save polling cursor to Redis
   */
  private async savePollingCursor(
    cursor: string,
    key = 'event:polling:cursor',
  ): Promise<void> {
    try {
      await this.redisClient.set(key, cursor);
    } catch (error) {
      this.logger.warn(
        `Error saving polling cursor: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Disconnect WebSocket
   */
  private async disconnect(): Promise<void> {
    try {
      if (this.wsSubscription) {
        await this.wsSubscription();
        this.wsSubscription = null;
      }

      this.isConnected = false;
      this.pollingActive = false;

      this.logger.log('WebSocket disconnected');
    } catch (error) {
      this.logger.warn(
        `Error disconnecting WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get connection status
   */
  public getStatus(): {
    isConnected: boolean;
    pollingActive: boolean;
    reconnectAttempts: number;
  } {
    return {
      isConnected: this.isConnected,
      pollingActive: this.pollingActive,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}
