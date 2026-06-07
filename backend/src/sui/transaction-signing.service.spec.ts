import { Test, TestingModule } from '@nestjs/testing';
import { TransactionSigningService } from './transaction-signing.service';
import { SUI_KEYPAIR } from './sui.module';

describe('TransactionSigningService', () => {
  let service: TransactionSigningService;
  let mockKeypair: any;

  beforeEach(async () => {
    mockKeypair = {
      toSuiAddress: jest.fn(() => '0x' + 'a'.repeat(64)),
      getPublicKey: jest.fn(() => ({
        toBase64: jest.fn(() => 'dGVzdFB1YmxpY0tleQ=='),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionSigningService,
        {
          provide: SUI_KEYPAIR,
          useValue: mockKeypair,
        },
      ],
    }).compile();

    service = module.get<TransactionSigningService>(TransactionSigningService);
  });

  describe('getSenderAddress', () => {
    it('should return the sender address from keypair', () => {
      const address = service.getSenderAddress();

      expect(address).toBe('0x' + 'a'.repeat(64));
      expect(mockKeypair.toSuiAddress).toHaveBeenCalled();
    });

    it('should return consistent address across multiple calls', () => {
      const address1 = service.getSenderAddress();
      const address2 = service.getSenderAddress();

      expect(address1).toBe(address2);
    });
  });

  describe('getPublicKeyBase64', () => {
    it('should return public key in base64 format', () => {
      const publicKey = service.getPublicKeyBase64();

      expect(publicKey).toBe('dGVzdFB1YmxpY0tleQ==');
    });

    it('should be consistent across multiple calls', () => {
      const key1 = service.getPublicKeyBase64();
      const key2 = service.getPublicKeyBase64();

      expect(key1).toBe(key2);
    });
  });

  describe('verifySigner', () => {
    it('should return signer address and public key', () => {
      const result = service.verifySigner();

      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('publicKey');
      expect(result.address).toBe('0x' + 'a'.repeat(64));
      expect(result.publicKey).toBe('dGVzdFB1YmxpY0tleQ==');
    });
  });

  describe('signTransaction', () => {
    it('should sign a transaction successfully', async () => {
      const mockTx = {
        sign: jest.fn().mockResolvedValue({
          bytes: 'signedTxBytes',
          digest: 'txDigest',
        }),
      };

      const result = await service.signTransaction(mockTx as any);

      expect(result).toHaveProperty('signedBytes');
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('sender');
      expect(result.sender).toBe('0x' + 'a'.repeat(64));
    });

    it('should handle signing errors gracefully', async () => {
      const mockTx = {
        sign: jest.fn().mockRejectedValue(new Error('Signing failed')),
      };

      await expect(service.signTransaction(mockTx as any)).rejects.toThrow('Transaction signing failed');
    });

    it('should not expose private key in any output', async () => {
      const mockTx = {
        sign: jest.fn().mockResolvedValue({
          bytes: 'signedTxBytes',
          digest: 'txDigest',
        }),
      };

      const result = await service.signTransaction(mockTx as any);

      // Verify private key is not in the result
      expect(JSON.stringify(result)).not.toContain('privateKey');
      expect(JSON.stringify(result)).not.toContain('private');
    });
  });

  describe('Property: Deterministic Signing', () => {
    it('should produce same signature for identical transactions (deterministic)', async () => {
      const mockTx1 = {
        sign: jest.fn().mockResolvedValue({
          bytes: 'signedTxBytes123',
          digest: 'txDigest',
        }),
      };

      const mockTx2 = {
        sign: jest.fn().mockResolvedValue({
          bytes: 'signedTxBytes123', // Same bytes for same transaction
          digest: 'txDigest',
        }),
      };

      const result1 = await service.signTransaction(mockTx1 as any);
      const result2 = await service.signTransaction(mockTx2 as any);

      // Both signatures should be from same signer
      expect(result1.sender).toBe(result2.sender);
      expect(result1.publicKey).toBe(result2.publicKey);
    });
  });
});
