import { Migration } from '@mikro-orm/migrations';

export class Migration20261028125731 extends Migration {
  override name = 'Migration20261028125731';

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "idempotency_keys" add "request_hash" varchar(64) not null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "idempotency_keys" drop column "request_hash";`);
  }
}
