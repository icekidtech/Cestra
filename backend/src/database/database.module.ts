import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
        const missing = required.filter((key) => !config.get<string>(key));
        if (missing.length > 0) {
          throw new Error(
            `Missing required environment variables: ${missing.join(', ')}. ` +
            `Copy backend/.env.example to backend/.env and fill in all values.`,
          );
        }
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST'),
          port: config.get<number>('DB_PORT'),
          database: config.get<string>('DB_NAME'),
          username: config.get<string>('DB_USER'),
          password: config.get<string>('DB_PASSWORD'),
          // Entity classes will be imported here as they are created
          entities: [],
          // autoLoadEntities picks up entities registered via TypeOrmModule.forFeature() in feature modules
          autoLoadEntities: true,
          // Never auto-sync schema — all schema changes go through explicit migrations
          synchronize: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
