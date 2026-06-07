import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { BlockchainConfigService } from './blockchain-config.service';

export const SUI_CLIENT = 'SUI_CLIENT';
export const SUI_KEYPAIR = 'SUI_KEYPAIR';

@Module({
  providers: [
    {
      provide: SUI_CLIENT,
      useFactory: (configService: ConfigService) => {
        const rpcUrl = configService.get<string>('SUI_RPC_URL');
        if (!rpcUrl) {
          throw new Error('SUI_RPC_URL environment variable is not set');
        }

        return new SuiClient({
          url: rpcUrl,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: SUI_KEYPAIR,
      useFactory: (configService: ConfigService) => {
        const privateKeyBase64 = configService.get<string>('SUI_PRIVATE_KEY');
        if (!privateKeyBase64) {
          throw new Error('SUI_PRIVATE_KEY environment variable is not set');
        }

        try {
          const privateKeyBytes = Buffer.from(privateKeyBase64, 'base64');
          return Ed25519Keypair.fromSecretKey(privateKeyBytes);
        } catch (error) {
          throw new Error(
            `Failed to initialize Ed25519Keypair: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
      inject: [ConfigService],
    },
    BlockchainConfigService,
  ],
  exports: [SUI_CLIENT, SUI_KEYPAIR, BlockchainConfigService],
})
export class SuiModule implements OnModuleInit {
  private readonly logger = new Logger(SuiModule.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const rpcUrl = this.configService.get<string>('SUI_RPC_URL');
    const network = this.configService.get<string>('SUI_NETWORK');

    try {
      const client = new SuiClient({ url: rpcUrl });
      await client.getRpcApiVersion();

      this.logger.log(
        `Connected to Sui ${network} network at RPC endpoint: ${rpcUrl}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to connect to Sui RPC at ${rpcUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error('Sui RPC connection failed at startup');
    }
  }
}
