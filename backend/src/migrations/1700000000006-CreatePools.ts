import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePools1700000000006 implements MigrationInterface {
  name = 'CreatePools1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pools" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creator_id" uuid NOT NULL,
        "recipient_id" uuid NOT NULL,
        "target_amount" numeric(20,6) NOT NULL,
        "current_amount" numeric(20,6) NOT NULL DEFAULT 0,
        "deadline" TIMESTAMPTZ NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pools" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pools_creator_id" FOREIGN KEY ("creator_id")
          REFERENCES "users"("id"),
        CONSTRAINT "FK_pools_recipient_id" FOREIGN KEY ("recipient_id")
          REFERENCES "recipients"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_pools_creator_id" ON "pools" ("creator_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pools_status" ON "pools" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "pool_contributions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "pool_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "amount" numeric(20,6) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pool_contributions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pool_contributions_pool_id" FOREIGN KEY ("pool_id")
          REFERENCES "pools"("id"),
        CONSTRAINT "FK_pool_contributions_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_pool_contributions_pool_id" ON "pool_contributions" ("pool_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pool_contributions_user_id" ON "pool_contributions" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_pool_contributions_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_pool_contributions_pool_id"`);
    await queryRunner.query(`DROP TABLE "pool_contributions"`);
    await queryRunner.query(`DROP INDEX "IDX_pools_status"`);
    await queryRunner.query(`DROP INDEX "IDX_pools_creator_id"`);
    await queryRunner.query(`DROP TABLE "pools"`);
  }
}
