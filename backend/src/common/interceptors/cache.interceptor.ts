import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  mixin,
  Type,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

export function CacheInterceptor(
  keyFactory: (req: any) => string,
  ttlSeconds: number,
): Type<NestInterceptor> {
  @Injectable()
  class MixinCacheInterceptor implements NestInterceptor {
    constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
      const request = context.switchToHttp().getRequest();
      const cacheKey = keyFactory(request);

      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return of(JSON.parse(cached));
        }
      } catch {
        // Redis unavailable — fall through to handler
      }

      return next.handle().pipe(
        tap(async (data) => {
          try {
            await this.redis.setex(cacheKey, ttlSeconds, JSON.stringify(data));
          } catch {
            // Redis unavailable — ignore cache write failure
          }
        }),
      );
    }
  }

  return mixin(MixinCacheInterceptor);
}
