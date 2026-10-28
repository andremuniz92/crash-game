import { testOrm } from './test-orm.js';

describe('banco de teste', () => {
  it('conecta (checkConnection)', async () => {
    const orm = await testOrm();
    await expect(orm.checkConnection()).resolves.toMatchObject({ ok: true });
  });

  it('está conectado ao crash_game_test', async () => {
    const orm = await testOrm();
    const [row] = await orm.em
      .getConnection()
      .execute<{ name: string }[]>('select current_database() as name');
    expect(row?.name).toBe('crash_game_test');
  });

  it('tem a tabela de controle das migrations depois do globalSetup', async () => {
    const orm = await testOrm();
    const rows = await orm.em
      .getConnection()
      .execute<{ exists: boolean }[]>(
        `select to_regclass('public.mikro_orm_migrations') is not null as exists`,
      );
    expect(rows[0]?.exists).toBe(true);
  });
});
