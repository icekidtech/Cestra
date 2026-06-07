import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateBlockchainEntities1700000000008
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Transaction table
    await queryRunner.createTable(
      new Table({
        name: 'transactions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'sender',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'recipient',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'fee',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'kyc_tier',
            type: 'smallint',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'PENDING'",
            isNullable: false,
          },
          {
            name: 'on_chain_digest',
            type: 'varchar',
            length: '255',
            isNullable: true,
            isUnique: true,
          },
          {
            name: 'root_cause',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'transactions',
      new TableIndex({
        name: 'IDX_transactions_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'transactions',
      new TableIndex({
        name: 'IDX_transactions_sender',
        columnNames: ['sender'],
      }),
    );
    await queryRunner.createIndex(
      'transactions',
      new TableIndex({
        name: 'IDX_transactions_recipient',
        columnNames: ['recipient'],
      }),
    );
    await queryRunner.createIndex(
      'transactions',
      new TableIndex({
        name: 'IDX_transactions_on_chain_digest',
        columnNames: ['on_chain_digest'],
      }),
    );
    await queryRunner.createIndex(
      'transactions',
      new TableIndex({
        name: 'IDX_transactions_created_at',
        columnNames: ['created_at'],
      }),
    );
    await queryRunner.createIndex(
      'transactions',
      new TableIndex({
        name: 'IDX_transactions_user_id',
        columnNames: ['user_id'],
      }),
    );

    // PendingTransaction table
    await queryRunner.createTable(
      new Table({
        name: 'pending_transactions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'tx_digest',
            type: 'varchar',
            length: '255',
            isNullable: true,
            isUnique: true,
          },
          {
            name: 'sender',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'function',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'arguments',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'SUBMITTED'",
            isNullable: false,
          },
          {
            name: 'idempotency_key',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'signed_tx_bytes',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'retry_count',
            type: 'smallint',
            default: 0,
            isNullable: false,
          },
          {
            name: 'last_retry_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'pending_transactions',
      new TableIndex({
        name: 'IDX_pending_transactions_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'pending_transactions',
      new TableIndex({
        name: 'IDX_pending_transactions_tx_digest',
        columnNames: ['tx_digest'],
      }),
    );
    await queryRunner.createIndex(
      'pending_transactions',
      new TableIndex({
        name: 'IDX_pending_transactions_sender',
        columnNames: ['sender'],
      }),
    );
    await queryRunner.createIndex(
      'pending_transactions',
      new TableIndex({
        name: 'IDX_pending_transactions_created_at',
        columnNames: ['created_at'],
      }),
    );
    await queryRunner.createIndex(
      'pending_transactions',
      new TableIndex({
        name: 'IDX_pending_transactions_idempotency_key',
        columnNames: ['idempotency_key'],
      }),
    );

    // BatchPayout table
    await queryRunner.createTable(
      new Table({
        name: 'batch_payouts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'pool_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'ACTIVE'",
            isNullable: false,
          },
          {
            name: 'target_recipients',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'contributors',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'total_amount',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'executed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'batch_payouts',
      new TableIndex({
        name: 'IDX_batch_payouts_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'batch_payouts',
      new TableIndex({
        name: 'IDX_batch_payouts_pool_id',
        columnNames: ['pool_id'],
      }),
    );
    await queryRunner.createIndex(
      'batch_payouts',
      new TableIndex({
        name: 'IDX_batch_payouts_created_at',
        columnNames: ['created_at'],
      }),
    );

    // YieldDeposit table
    await queryRunner.createTable(
      new Table({
        name: 'yield_deposits',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'vault_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'shares',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'accrued_value',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'ACTIVE'",
            isNullable: false,
          },
          {
            name: 'deposited_at',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'withdrawn_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'yield_deposits',
      new TableIndex({
        name: 'IDX_yield_deposits_user_id',
        columnNames: ['user_id'],
      }),
    );
    await queryRunner.createIndex(
      'yield_deposits',
      new TableIndex({
        name: 'IDX_yield_deposits_vault_id',
        columnNames: ['vault_id'],
      }),
    );
    await queryRunner.createIndex(
      'yield_deposits',
      new TableIndex({
        name: 'IDX_yield_deposits_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'yield_deposits',
      new TableIndex({
        name: 'IDX_yield_deposits_created_at',
        columnNames: ['created_at'],
      }),
    );

    // SavingsCircle table
    await queryRunner.createTable(
      new Table({
        name: 'savings_circles',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'circle_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'members',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'current_round',
            type: 'smallint',
            default: 1,
            isNullable: false,
          },
          {
            name: 'payout_schedule',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'ACTIVE'",
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'savings_circles',
      new TableIndex({
        name: 'IDX_savings_circles_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'savings_circles',
      new TableIndex({
        name: 'IDX_savings_circles_circle_id',
        columnNames: ['circle_id'],
      }),
    );
    await queryRunner.createIndex(
      'savings_circles',
      new TableIndex({
        name: 'IDX_savings_circles_created_at',
        columnNames: ['created_at'],
      }),
    );

    // RateLock table
    await queryRunner.createTable(
      new Table({
        name: 'rate_locks',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'business_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'lock_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'locked_amount',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'fx_rate',
            type: 'numeric',
            precision: 18,
            scale: 8,
            isNullable: false,
          },
          {
            name: 'expiry_at',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'ACTIVE'",
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['business_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'rate_locks',
      new TableIndex({
        name: 'IDX_rate_locks_business_id',
        columnNames: ['business_id'],
      }),
    );
    await queryRunner.createIndex(
      'rate_locks',
      new TableIndex({
        name: 'IDX_rate_locks_lock_id',
        columnNames: ['lock_id'],
      }),
    );
    await queryRunner.createIndex(
      'rate_locks',
      new TableIndex({
        name: 'IDX_rate_locks_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'rate_locks',
      new TableIndex({
        name: 'IDX_rate_locks_expiry_at',
        columnNames: ['expiry_at'],
      }),
    );
    await queryRunner.createIndex(
      'rate_locks',
      new TableIndex({
        name: 'IDX_rate_locks_created_at',
        columnNames: ['created_at'],
      }),
    );

    // CrossChainTransfer table
    await queryRunner.createTable(
      new Table({
        name: 'cross_chain_transfers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'source_chain',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'receiver',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'message_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'PENDING'",
            isNullable: false,
          },
          {
            name: 'bridge_protocol',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'received_amount',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'received_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'failure_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'NOW()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'cross_chain_transfers',
      new TableIndex({
        name: 'IDX_cross_chain_transfers_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'cross_chain_transfers',
      new TableIndex({
        name: 'IDX_cross_chain_transfers_message_id',
        columnNames: ['message_id'],
      }),
    );
    await queryRunner.createIndex(
      'cross_chain_transfers',
      new TableIndex({
        name: 'IDX_cross_chain_transfers_receiver',
        columnNames: ['receiver'],
      }),
    );
    await queryRunner.createIndex(
      'cross_chain_transfers',
      new TableIndex({
        name: 'IDX_cross_chain_transfers_created_at',
        columnNames: ['created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('cross_chain_transfers');
    await queryRunner.dropTable('rate_locks');
    await queryRunner.dropTable('savings_circles');
    await queryRunner.dropTable('yield_deposits');
    await queryRunner.dropTable('batch_payouts');
    await queryRunner.dropTable('pending_transactions');
    await queryRunner.dropTable('transactions');
  }
}
