import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRecipients1700000000004 implements MigrationInterface {
  name = 'CreateRecipients1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "recipients" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "country" char(2) NOT NULL,
        "mobile_money_type" character varying(50) NOT NULL,
        "account_number" character varying(100) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recipients" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_recipients_user_account_type"
          UNIQUE ("user_id", "account_number", "mobile_money_type"),
        CONSTRAINT "FK_recipients_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_recipients_user_id" ON "recipients" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_recipients_user_id"`);
    await queryRunner.query(`DROP TABLE "recipients"`);
  }
}
