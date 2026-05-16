import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBusinesses1700000000002 implements MigrationInterface {
  name = 'CreateBusinesses1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "businesses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(255) NOT NULL,
        "api_key_hash" character varying(255) NOT NULL,
        "webhook_url" character varying(500),
        "webhook_secret" character varying(255),
        "rate_limit_tier" character varying(20) NOT NULL DEFAULT 'business',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_businesses" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "businesses"`);
  }
}
