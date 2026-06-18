import { Injectable, Logger } from '@nestjs/common';
import { OnChainMonitorService, ParsedEvent, OnChainEventType } from './on-chain-monitor.service';

/**
 * EventRoutingService maps event types to module-specific handlers.
 *
 * Features:
 * - Extensible event handler registration
 * - Automatic handler discovery for modules
 * - Comprehensive error handling
 * - Support for async handlers
 */

export type EventHandler = (event: ParsedEvent) => Promise<void>;

export interface EventHandlerRegistry {
  [eventType: string]: EventHandler[];
}

@Injectable()
export class EventRoutingService {
  private readonly logger = new Logger(EventRoutingService.name);
  private handlers: EventHandlerRegistry = {};

  constructor(
    private onChainMonitorService: OnChainMonitorService,
  ) {
    this.initializeHandlers();
  }

  /**
   * Initialize built-in event handlers
   */
  private initializeHandlers(): void {
    // Module event types - handlers will be registered by individual modules
    this.handlers = {
      [OnChainEventType.SEND_EVENT]: [],
      [OnChainEventType.POOL_CREATED]: [],
      [OnChainEventType.POOL_CONTRIBUTED]: [],
      [OnChainEventType.POOL_EXECUTED]: [],
      [OnChainEventType.YIELD_DEPOSITED]: [],
      [OnChainEventType.YIELD_ACCRUED]: [],
      [OnChainEventType.CIRCLE_CREATED]: [],
      [OnChainEventType.CIRCLE_PAYOUT_TRIGGERED]: [],
      [OnChainEventType.RATELOCK_CREATED]: [],
      [OnChainEventType.RATELOCK_FILLED]: [],
      [OnChainEventType.RATELOCK_EXPIRED]: [],
      [OnChainEventType.BRIDGE_CCTP_COMPLETED]: [],
      [OnChainEventType.BRIDGE_WORMHOLE_COMPLETED]: [],
    };

    // Subscribe to all events
    this.onChainMonitorService.onEvent('event', async (event: ParsedEvent) => {
      await this.routeEvent(event);
    });

    this.logger.log('EventRoutingService initialized');
  }

  /**
   * Register an event handler for a specific event type
   */
  registerHandler(
    eventType: string | OnChainEventType,
    handler: EventHandler,
  ): void {
    if (!this.handlers[eventType]) {
      this.handlers[eventType] = [];
    }

    this.handlers[eventType].push(handler);

    this.logger.debug(
      `Handler registered for event type: ${eventType} (total: ${this.handlers[eventType].length})`,
    );
  }

  /**
   * Register multiple handlers at once
   */
  registerHandlers(
    handlers: Array<{
      eventType: string | OnChainEventType;
      handler: EventHandler;
    }>,
  ): void {
    for (const { eventType, handler } of handlers) {
      this.registerHandler(eventType, handler);
    }
  }

  /**
   * Route event to all registered handlers
   */
  private async routeEvent(event: ParsedEvent): Promise<void> {
    const handlers = this.handlers[event.eventType];

    if (!handlers || handlers.length === 0) {
      this.logger.warn(
        `No handlers registered for event type: ${event.eventType}`,
      );
      return;
    }

    this.logger.debug(
      `Routing event ${event.eventType} (digest: ${event.digest}) to ${handlers.length} handler(s)`,
    );

    // Execute all handlers in parallel but catch individual errors
    const results = await Promise.allSettled(
      handlers.map((handler) => handler(event)),
    );

    // Log any errors but don't block other handlers
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const reason = results[i];
        this.logger.error(
          `Handler ${i} failed for ${event.eventType}: ${reason instanceof Error ? reason.message : 'Unknown error'}`,
        );
      }
    }
  }

  /**
   * Get all registered handlers for an event type
   */
  getHandlers(eventType: string | OnChainEventType): EventHandler[] {
    return this.handlers[eventType] || [];
  }

  /**
   * Get statistics about registered handlers
   */
  getStats(): {
    totalEventTypes: number;
    totalHandlers: number;
    handlerCounts: { [eventType: string]: number };
  } {
    const handlerCounts: { [eventType: string]: number } = {};
    let totalHandlers = 0;

    for (const [eventType, handlers] of Object.entries(this.handlers)) {
      handlerCounts[eventType] = handlers.length;
      totalHandlers += handlers.length;
    }

    return {
      totalEventTypes: Object.keys(this.handlers).length,
      totalHandlers,
      handlerCounts,
    };
  }

  /**
   * Clear all handlers (for testing)
   */
  clearHandlers(): void {
    for (const eventType of Object.keys(this.handlers)) {
      this.handlers[eventType] = [];
    }
    this.logger.log('All handlers cleared');
  }
}
