import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWallets1700000000003 implements MigrationInterface {
  name = 'CreateWallets1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "balance_usdsui" numeric(20,6) NOT NULL DEFAULT 0,
        "yield_enabled" boolean NOT NULL DEFAULT false,
        "yield_balance" numeric(20,6) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallets_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_wallets_user_id" ON "wallets" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "bridge_addresses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "chain" character varying(20) NOT NULL,
        "address" character varying(255) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_bridge_addresses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bridge_addresses_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bridge_addresses_user_id" ON "bridge_addresses" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bridge_addresses_user_id"`);
    await queryRunner.query(`DROP TABLE "bridge_addresses"`);
    await queryRunner.query(`DROP INDEX "IDX_wallets_user_id"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
  }
}
