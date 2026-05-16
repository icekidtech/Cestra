import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactions1700000000005 implements MigrationInterface {
  name = 'CreateTransactions1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "recipient_id" uuid,
        "type" character varying(20) NOT NULL,
        "amount" numeric(20,6) NOT NULL,
        "fee" numeric(20,6) NOT NULL DEFAULT 0,
        "corridor" character varying(20),
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "on_chain_tx_hash" character varying(255),
        "local_amount" numeric(20,6),
        "local_currency" character varying(10),
        "idempotency_key" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transactions_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_transactions_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id"),
        CONSTRAINT "FK_transactions_recipient_id" FOREIGN KEY ("recipient_id")
          REFERENCES "recipients"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_user_id" ON "transactions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_status" ON "transactions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_created_at" ON "transactions" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_transactions_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_status"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_user_id"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
  }
}
