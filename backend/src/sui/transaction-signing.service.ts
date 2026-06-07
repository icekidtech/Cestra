import { Injectable, Logger, Inject } from '@nestjs/common';
import { SUI_KEYPAIR } from './sui.module';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

export interface SignedTransactionResult {
  signedBytes: string;
  publicKey: string;
  sender: string;
  digest?: string;
}

@Injectable()
export class TransactionSigningService {
  private readonly logger = new Logger(TransactionSigningService.name);

  constructor(@Inject(SUI_KEYPAIR) private keypair: Ed25519Keypair) {}

  /**
   * Sign a transaction block using the configured keypair
   */
  async signTransaction(tx: Transaction): Promise<SignedTransactionResult> {
    this.logger.debug('Signing transaction with Ed25519 keypair');

    try {
      // Get the sender address from the keypair
      const sender = this.keypair.toSuiAddress();

      // Sign the transaction
      const signedTx = await tx.sign({ client: undefined, signer: this.keypair });

      // Get the public key in base64 format
      const publicKey = this.keypair.getPublicKey().toBase64();

      // Get signed bytes
      const signedBytes = signedTx.bytes;

      this.logger.debug(
        `Transaction signed successfully. Sender: ${sender}, Public Key: ${publicKey.substring(0, 20)}...`,
      );

      return {
        signedBytes,
        publicKey,
        sender,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to sign transaction: ${errorMessage}`);
      throw new Error(`Transaction signing failed: ${errorMessage}`);
    }
  }

  /**
   * Verify that a transaction is properly signed by checking the keypair
   * This is mainly for testing/debugging purposes
   */
  verifySigner(): { address: string; publicKey: string } {
    const address = this.keypair.toSuiAddress();
    const publicKey = this.keypair.getPublicKey().toBase64();

    this.logger.debug(
      `Signer verified - Address: ${address}, Public Key: ${publicKey.substring(0, 20)}...`,
    );

    return { address, publicKey };
  }

  /**
   * Get the sender address (derived from keypair)
   */
  getSenderAddress(): string {
    return this.keypair.toSuiAddress();
  }

  /**
   * Get the public key in base64 format
   */
  getPublicKeyBase64(): string {
    return this.keypair.getPublicKey().toBase64();
  }
}
