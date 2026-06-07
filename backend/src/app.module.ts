import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { REDIS_CLIENT } from './redis/redis.constants';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { SendModule } from './send/send.module';
import { TransactionsModule } from './transactions/transactions.module';
import { RecipientsModule } from './recipients/recipients.module';
import { YieldModule } from './yield/yield.module';
import { PoolModule } from './pool/pool.module';
import { BusinessModule } from './business/business.module';
import { BlockchainModule } from './blockchain/blockchain.module';

@Module({
  imports: [
    // Global config with env validation
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),

    // Scheduled tasks (cron jobs)
    ScheduleModule.forRoot(),

    // Database
    DatabaseModule,

    // Redis (global — available everywhere)
    RedisModule,

    // Rate limiting via Redis
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'consumer', ttl: 60000, limit: 60 },
          { name: 'business', ttl: 60000, limit: 600 },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),

    // Blockchain & Sui Integration (includes SuiModule)
    BlockchainModule,

    // Feature modules
    AuthModule,
    WalletModule,
    SendModule,
    TransactionsModule,
    RecipientsModule,
    YieldModule,
    PoolModule,
    BusinessModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
