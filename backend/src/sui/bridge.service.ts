import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { CrossChainTransfer } from '../blockchain/entities/cross-chain-transfer.entity';
import { TransactionBuilderService, BridgeTransactionInput } from './transaction-builder.service';
import { TransactionSubmissionService } from './transaction-submission.service';

export interface BridgeTransfer {
  sourceChain: string;
  receiver: string;
  amount: bigint;
  messageId: string;
  bridgeProtocol: string;
  attestationData?: string;
  vaaData?: string;
}

export interface BridgeStatusResponse {
  transferId: string;
  sourceChain: string;
  receiver: string;
  amount: string;
  messageId: string;
  status: string;
  bridgeProtocol: string;
  receivedAt?: string;
  createdAt: string;
}

@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);

  constructor(
    @InjectRepository(CrossChainTransfer)
    private crossChainTransferRepository: Repository<CrossChainTransfer>,
    private transactionBuilderService: TransactionBuilderService,
    private transactionSubmissionService: TransactionSubmissionService,
  ) {}

  /**
   * Register a pending bridge transfer from external chain
   *
   * @param transfer Bridge transfer details
   * @returns Transfer ID
   */
  async registerPendingTransfer(transfer: BridgeTransfer): Promise<string> {
    const { sourceChain, receiver, amount, messageId, bridgeProtocol } = transfer;

    this.logger.debug(
      `Registering pending bridge transfer: sourceChain=${sourceChain}, receiver=${receiver}, amount=${amount}, protocol=${bridgeProtocol}`,
    );

    const pendingTransfer = this.crossChainTransferRepository.create({
      sourceChain,
      receiver,
      amount: amount.toString(),
      messageId,
      status: 'PENDING',
      bridgeProtocol,
    });

    await this.crossChainTransferRepository.save(pendingTransfer);

    this.logger.log(`Pending bridge transfer registered: transferId=${pendingTransfer.id}`);

    return pendingTransfer.id;
  }

  /**
   * Get bridge transfer status
   *
   * @param transferId Transfer ID
   * @returns Transfer status details
   */
  async getTransferStatus(transferId: string): Promise<BridgeStatusResponse> {
    const transfer = await this.crossChainTransferRepository.findOne({
      where: { id: transferId },
    });

    if (!transfer) {
      return null;
    }

    return {
      transferId: transfer.id,
      sourceChain: transfer.sourceChain,
      receiver: transfer.receiver,
      amount: transfer.amount,
      messageId: transfer.messageId,
      status: transfer.status,
      bridgeProtocol: transfer.bridgeProtocol,
      receivedAt: transfer.receivedAt ? transfer.receivedAt.toISOString() : undefined,
      createdAt: transfer.createdAt.toISOString(),
    };
  }

  /**
   * Scheduled job: Every 10 seconds, poll for completed CCTP attestations
   *
   * This job checks for CCTP attestations on Circle's attestation service
   * and submits complete_cctp_receive transactions to Sui.
   */
  @Cron('*/10 * * * * *')
  async pollCCTPAttestations(): Promise<void> {
    this.logger.debug('Polling for CCTP attestations');

    try {
      // Get pending CCTP transfers
      const pendingTransfers = await this.crossChainTransferRepository.find({
        where: { status: 'PENDING', bridgeProtocol: 'CCTP' },
      });

      for (const transfer of pendingTransfers) {
        try {
          // Check if attestation is available (would call Circle's attestation service)
          // For now, we simulate the check
          const attestationAvailable = await this.checkCCTPAttestation(transfer.messageId);

          if (!attestationAvailable) {
            continue;
          }

          // Build complete_cctp_receive transaction
          let buildResult;
          try {
            buildResult = await this.transactionBuilderService.buildBridgeTransaction({
              operation: 'complete_cctp',
              messageId: transfer.messageId,
              receiver: transfer.receiver,
              amount: BigInt(transfer.amount),
            } as BridgeTransactionInput);
          } catch (buildError) {
            this.logger.warn(`Failed to build CCTP completion for transfer ${transfer.id}: ${buildError instanceof Error ? buildError.message : 'Unknown error'}`);
            continue;
          }

          // Submit transaction
          try {
            const submitResult = await this.transactionSubmissionService.submitWithRetry(
              buildResult.transaction.toString(),
              buildResult.sender,
              'complete_cctp',
              [transfer.messageId, transfer.receiver, transfer.amount],
              buildResult.idempotencyKey,
            );

            transfer.status = 'COMPLETED';
            transfer.receivedAt = new Date();
            await this.crossChainTransferRepository.save(transfer);

            this.logger.log(
              `CCTP bridge transfer completed: transferId=${transfer.id}, digest=${submitResult.digest}`,
            );
          } catch (error) {
            this.logger.error(
              `CCTP completion submission failed for transfer ${transfer.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to process CCTP transfer ${transfer.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `CCTP attestation polling job failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Scheduled job: Every 10 seconds, poll for Wormhole VAAs
   *
   * This job checks for signed Wormhole VAAs and submits complete_wormhole_receive
   * transactions to Sui.
   */
  @Cron('*/10 * * * * *')
  async pollWormholeVAAs(): Promise<void> {
    this.logger.debug('Polling for Wormhole VAAs');

    try {
      // Get pending Wormhole transfers
      const pendingTransfers = await this.crossChainTransferRepository.find({
        where: { status: 'PENDING', bridgeProtocol: 'Wormhole' },
      });

      for (const transfer of pendingTransfers) {
        try {
          // Check if VAA is available (would call Wormhole's VAA API)
          // For now, we simulate the check
          const vaaAvailable = await this.checkWormholeVAA(transfer.messageId);

          if (!vaaAvailable) {
            continue;
          }

          // Build complete_wormhole_receive transaction
          let buildResult;
          try {
            buildResult = await this.transactionBuilderService.buildBridgeTransaction({
              operation: 'complete_wormhole',
              messageId: transfer.messageId,
              receiver: transfer.receiver,
              amount: BigInt(transfer.amount),
            } as BridgeTransactionInput);
          } catch (buildError) {
            this.logger.warn(`Failed to build Wormhole completion for transfer ${transfer.id}: ${buildError instanceof Error ? buildError.message : 'Unknown error'}`);
            continue;
          }

          // Submit transaction
          try {
            const submitResult = await this.transactionSubmissionService.submitWithRetry(
              buildResult.transaction.toString(),
              buildResult.sender,
              'complete_wormhole',
              [transfer.messageId, transfer.receiver, transfer.amount],
              buildResult.idempotencyKey,
            );

            transfer.status = 'COMPLETED';
            transfer.receivedAt = new Date();
            await this.crossChainTransferRepository.save(transfer);

            this.logger.log(
              `Wormhole bridge transfer completed: transferId=${transfer.id}, digest=${submitResult.digest}`,
            );
          } catch (error) {
            this.logger.error(
              `Wormhole completion submission failed for transfer ${transfer.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to process Wormhole transfer ${transfer.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Wormhole VAA polling job failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Scheduled job: Every 30 seconds, retry failed bridge transfers
   *
   * This job identifies transfers that failed and retries them with
   * fresh context, allowing recovery after transient failures.
   */
  @Cron('*/30 * * * * *')
  async retryFailedTransfers(): Promise<void> {
    this.logger.debug('Retrying failed bridge transfers');

    try {
      // Get failed transfers
      const failedTransfers = await this.crossChainTransferRepository.find({
        where: { status: 'FAILED' },
      });

      for (const transfer of failedTransfers) {
        try {
          this.logger.debug(`Retrying failed bridge transfer: ${transfer.id}`);

          // Determine operation based on protocol
          const operation = transfer.bridgeProtocol === 'CCTP' ? 'complete_cctp' : 'complete_wormhole';

          // Build retry transaction
          let buildResult;
          try {
            buildResult = await this.transactionBuilderService.buildBridgeTransaction({
              operation,
              messageId: transfer.messageId,
              receiver: transfer.receiver,
              amount: BigInt(transfer.amount),
            } as BridgeTransactionInput);
          } catch (buildError) {
            this.logger.warn(
              `Failed to build retry transaction for transfer ${transfer.id}: ${buildError instanceof Error ? buildError.message : 'Unknown error'}`,
            );
            continue;
          }

          // Submit transaction
          try {
            const submitResult = await this.transactionSubmissionService.submitWithRetry(
              buildResult.transaction.toString(),
              buildResult.sender,
              operation,
              [transfer.messageId, transfer.receiver, transfer.amount],
              buildResult.idempotencyKey,
            );

            transfer.status = 'COMPLETED';
            transfer.receivedAt = new Date();
            await this.crossChainTransferRepository.save(transfer);

            this.logger.log(`Failed bridge transfer retry succeeded: transferId=${transfer.id}, digest=${submitResult.digest}`);
          } catch (error) {
            this.logger.error(
              `Bridge transfer retry submission failed for ${transfer.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to retry transfer ${transfer.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      this.logger.log(`Bridge transfer retry job completed, transfers processed: ${failedTransfers.length}`);
    } catch (error) {
      this.logger.error(
        `Bridge transfer retry job failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Check if CCTP attestation is available for a nonce
   * In production, this would call Circle's attestation service
   *
   * @param nonce CCTP nonce / message ID
   * @returns True if attestation is available
   */
  private async checkCCTPAttestation(nonce: string): Promise<boolean> {
    // Placeholder: would call Circle's attestation API
    // https://iris-api.circle.com/attestations/{nonce}
    return false;
  }

  /**
   * Check if Wormhole VAA is available for a message
   * In production, this would call Wormhole's VAA API
   *
   * @param messageHash Wormhole message hash
   * @returns True if VAA is signed and available
   */
  private async checkWormholeVAA(messageHash: string): Promise<boolean> {
    // Placeholder: would call Wormhole's VAA API
    // https://api.wormholescan.io/api/v1/signed_vaa/{chain}/{emitter}/{sequence}
    return false;
  }

  /**
   * Called by StateSyncService when BridgeReceiveCompleted event is received
   * Updates transfer status to RECEIVED
   *
   * @param messageId Message ID
   * @param receiver Receiver address
   * @param amountReceived Amount received
   */
  async onBridgeReceiveCompleted(messageId: string, receiver: string, amountReceived: bigint): Promise<void> {
    const transfer = await this.crossChainTransferRepository.findOne({
      where: { messageId },
    });

    if (!transfer) {
      this.logger.warn(`Bridge receive completed but transfer not found: messageId=${messageId}`);
      return;
    }

    transfer.status = 'RECEIVED';
    transfer.receivedAt = new Date();
    await this.crossChainTransferRepository.save(transfer);

    this.logger.log(
      `Bridge transfer received on-chain: transferId=${transfer.id}, messageId=${messageId}, amount=${amountReceived}`,
    );
  }

  /**
   * Called when bridge transfer fails
   * Updates transfer status to FAILED
   *
   * @param messageId Message ID
   * @param error Error reason
   */
  async onBridgeReceiveFailed(messageId: string, error: string): Promise<void> {
    const transfer = await this.crossChainTransferRepository.findOne({
      where: { messageId },
    });

    if (!transfer) {
      this.logger.warn(`Bridge receive failed but transfer not found: messageId=${messageId}`);
      return;
    }

    transfer.status = 'FAILED';
    await this.crossChainTransferRepository.save(transfer);

    this.logger.error(`Bridge transfer failed: transferId=${transfer.id}, messageId=${messageId}, error=${error}`);
  }
}
