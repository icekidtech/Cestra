import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ModuleConfig {
  name: string;
  packageId: string;
  functions: Record<string, string>;
  gasbudget?: number;
}

export interface BlockchainConfig {
  network: string;
  rpcUrl: string;
  packageId: string;
  modules: Record<string, ModuleConfig>;
  defaultGasBudget: number;
  /** Shared object IDs created at deploy time (see deploykeys.md). */
  objects: SharedObjects;
  /** Fully-qualified coin type used for settlement (e.g. USDC on testnet). */
  coinType: string;
}

export interface SharedObjects {
  complianceRegistry?: string;
  adminCapCompliance?: string;
  sendConfig?: string;
  sendEscrow?: string;
  txRegistry?: string;
  rateOracle?: string;
  rateLockConfig?: string;
  rateLockRegistry?: string;
  bridgeConfig?: string;
  processedMessages?: string;
  /** Sui system Clock object — always 0x6. */
  clock: string;
}

@Injectable()
export class BlockchainConfigService {
  private readonly logger = new Logger(BlockchainConfigService.name);
  private readonly config: BlockchainConfig;

  constructor(private configService: ConfigService) {
    this.config = this.initializeConfig();
  }

  private initializeConfig(): BlockchainConfig {
    const network = this.configService.get<string>('SUI_NETWORK', 'testnet');
    const rpcUrl = this.configService.get<string>('SUI_RPC_URL');
    const packageId = this.configService.get<string>('SUI_PACKAGE_ID');

    if (!rpcUrl || !packageId) {
      throw new Error(
        'SUI_RPC_URL and SUI_PACKAGE_ID must be configured in environment variables',
      );
    }

    const defaultGasBudget = 10_000_000; // 10 million MIST (~0.01 SUI)

    const objects: SharedObjects = {
      complianceRegistry: this.configService.get<string>('SUI_COMPLIANCE_REGISTRY'),
      adminCapCompliance: this.configService.get<string>('SUI_ADMIN_CAP_COMPLIANCE'),
      sendConfig: this.configService.get<string>('SUI_SEND_CONFIG'),
      sendEscrow: this.configService.get<string>('SUI_SEND_ESCROW'),
      txRegistry: this.configService.get<string>('SUI_TX_REGISTRY'),
      rateOracle: this.configService.get<string>('SUI_RATE_ORACLE'),
      rateLockConfig: this.configService.get<string>('SUI_RATE_LOCK_CONFIG'),
      rateLockRegistry: this.configService.get<string>('SUI_RATE_LOCK_REGISTRY'),
      bridgeConfig: this.configService.get<string>('SUI_BRIDGE_CONFIG'),
      processedMessages: this.configService.get<string>('SUI_PROCESSED_MESSAGES'),
      // Sui system Clock is a well-known shared object at 0x6.
      clock: this.configService.get<string>('SUI_CLOCK_OBJECT_ID', '0x6'),
    };

    // Settlement coin type. Defaults to Sui testnet USDC; override via env.
    const coinType = this.configService.get<string>(
      'SUI_COIN_TYPE',
      '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
    );

    const config: BlockchainConfig = {
      network,
      rpcUrl,
      packageId,
      defaultGasBudget,
      objects,
      coinType,
      modules: {
        send: {
          name: 'send',
          packageId,
          functions: {
            sendPayment: 'send',
            sendWithLock: 'send_with_lock',
            confirmDelivery: 'confirm_delivery',
            issueRefund: 'issue_refund',
          },
          gasbudget: defaultGasBudget,
        },
        pool: {
          name: 'pool',
          packageId,
          functions: {
            createPool: 'create_pool',
            contribute: 'contribute',
            execute: 'execute',
            refund: 'refund',
          },
          gasbudget: defaultGasBudget,
        },
        yield: {
          name: 'yield',
          packageId,
          functions: {
            deposit: 'deposit',
            withdraw: 'withdraw',
            accrueInterest: 'accrue_interest',
          },
          gasbudget: defaultGasBudget,
        },
        circle: {
          name: 'circle',
          packageId,
          functions: {
            createCircle: 'create_circle',
            contribute: 'contribute',
            triggerPayout: 'trigger_payout',
          },
          gasbudget: defaultGasBudget,
        },
        ratelock: {
          name: 'ratelock',
          packageId,
          functions: {
            createRateLock: 'create_rate_lock',
            expireLock: 'expire_lock',
          },
          gasbudget: defaultGasBudget,
        },
        bridge: {
          name: 'bridge',
          packageId,
          functions: {
            completeCctpReceive: 'complete_cctp_receive',
            completeWormholeReceive: 'complete_wormhole_receive',
          },
          gasbudget: defaultGasBudget,
        },
        compliance: {
          name: 'compliance',
          packageId,
          functions: {
            validateKyc: 'validate_kyc',
          },
          gasbudget: defaultGasBudget,
        },
      },
    };

    this.logger.log(
      `Blockchain configuration initialized for ${network} network at ${rpcUrl}`,
    );

    return config;
  }

  /**
   * Get the complete blockchain configuration
   */
  getConfig(): BlockchainConfig {
    return this.config;
  }

  /**
   * Get configuration for a specific module
   */
  getModuleConfig(moduleName: string): ModuleConfig {
    const moduleConfig = this.config.modules[moduleName];
    if (!moduleConfig) {
      throw new Error(`Module configuration not found: ${moduleName}`);
    }
    return moduleConfig;
  }

  /**
   * Get a specific function address within a module
   */
  getFunctionPath(moduleName: string, functionKey: string): string {
    const moduleConfig = this.getModuleConfig(moduleName);
    const functionName = moduleConfig.functions[functionKey];

    if (!functionName) {
      throw new Error(
        `Function not found in module ${moduleName}: ${functionKey}`,
      );
    }

    return `${moduleConfig.packageId}::${moduleName}::${functionName}`;
  }

  /**
   * Get the network identifier
   */
  getNetwork(): string {
    return this.config.network;
  }

  /**
   * Get the RPC URL
   */
  getRpcUrl(): string {
    return this.config.rpcUrl;
  }

  /**
   * Get the package ID
   */
  getPackageId(): string {
    return this.config.packageId;
  }

  /**
   * Get default gas budget
   */
  getDefaultGasBudget(): number {
    return this.config.defaultGasBudget;
  }

  /**
   * Get the deployed shared object IDs.
   */
  getObjects(): SharedObjects {
    return this.config.objects;
  }

  /**
   * Get a single shared object ID by key, throwing if it is not configured.
   */
  getObjectId(key: keyof SharedObjects): string {
    const value = this.config.objects[key];
    if (!value) {
      throw new Error(
        `Required shared object '${String(key)}' is not configured. ` +
          `Set the corresponding SUI_* environment variable (see deploykeys.md).`,
      );
    }
    return value;
  }

  /**
   * Get the settlement coin type (fully-qualified Move type).
   */
  getCoinType(): string {
    return this.config.coinType;
  }
}
