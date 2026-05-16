import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBusinessTables1700000000007 implements MigrationInterface {
  name = 'CreateBusinessTables1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "batch_payouts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "business_id" uuid NOT NULL,
        "total_amount" numeric(20,6) NOT NULL,
        "total_fee" numeric(20,6) NOT NULL,
        "success_count" integer NOT NULL DEFAULT 0,
        "fail_count" integer NOT NULL DEFAULT 0,
        "status" character varying(20) NOT NULL DEFAULT 'PROCESSING',
        "report_url" character varying(500),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_batch_payouts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_batch_payouts_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_batch_payouts_business_id" ON "batch_payouts" ("business_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "business_id" uuid NOT NULL,
        "amount" numeric(20,6) NOT NULL,
        "reference" character varying(255) NOT NULL,
        "due_date" date NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "payment_tx_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoices_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_invoices_business_id" ON "invoices" ("business_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "rate_locks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "business_id" uuid NOT NULL,
        "corridor" character varying(20) NOT NULL,
        "amount" numeric(20,6) NOT NULL,
        "locked_rate" numeric(20,8) NOT NULL,
        "lock_fee" numeric(20,6) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rate_locks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rate_locks_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_rate_locks_business_id" ON "rate_locks" ("business_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rate_locks_status" ON "rate_locks" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "webhook_deliveries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "business_id" uuid NOT NULL,
        "event_type" character varying(50) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "attempts" smallint NOT NULL DEFAULT 0,
        "last_attempted_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_webhook_deliveries_business_id" FOREIGN KEY ("business_id")
          REFERENCES "businesses"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_deliveries_business_id" ON "webhook_deliveries" ("business_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_webhook_deliveries_business_id"`);
    await queryRunner.query(`DROP TABLE "webhook_deliveries"`);
    await queryRunner.query(`DROP INDEX "IDX_rate_locks_status"`);
    await queryRunner.query(`DROP INDEX "IDX_rate_locks_business_id"`);
    await queryRunner.query(`DROP TABLE "rate_locks"`);
    await queryRunner.query(`DROP INDEX "IDX_invoices_business_id"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP INDEX "IDX_batch_payouts_business_id"`);
    await queryRunner.query(`DROP TABLE "batch_payouts"`);
  }
}
