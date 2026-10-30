import { testOrm } from '../../../../test/integration/test-orm.js';
import { readTestDatabaseConfig } from './database-config.js';
import { runMigrations } from './run-migrations.js';

const LAST_MIGRATION = 'Migration20261028125731';

const { clientUrl } = readTestDatabaseConfig(process.env);

async function hasRequestHashColumn(): Promise<boolean> {
  const [row] = await (
    await testOrm()
  ).em
    .getConnection()
    .execute<{ n: number }[]>(
      `select count(*)::int as n from information_schema.columns
     where table_name = 'idempotency_keys' and column_name = 'request_hash'`,
    );
  return row?.n === 1;
}

describe('runMigrations (D104)', () => {
  it('MG1: no banco já migrado, não aplica nada', async () => {
    expect(await runMigrations(clientUrl)).toEqual([]);
    expect(await hasRequestHashColumn()).toBe(true);
  });

  it('MG2: reaplica a migration desfeita e devolve o nome dela', async () => {
    const { migrator } = await testOrm();
    await migrator.down();
    expect(await hasRequestHashColumn()).toBe(false);

    try {
      expect(await runMigrations(clientUrl)).toEqual([LAST_MIGRATION]);
      expect(await hasRequestHashColumn()).toBe(true);
    } finally {
      // Os outros testes de integração precisam da coluna, passe ou falhe.
      await migrator.up();
    }
    expect(await hasRequestHashColumn()).toBe(true);
  });
});
