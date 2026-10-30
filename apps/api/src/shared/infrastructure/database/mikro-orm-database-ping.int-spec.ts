import { MikroORM } from '@mikro-orm/postgresql';
import { MikroOrmDatabasePing } from './mikro-orm-database-ping.js';
import { ormOptions } from './orm-options.js';

/*
 * Porta fechada no loopback: a conexão é recusada na hora (ECONNREFUSED), sem
 * depender do timeout de conexão.
 */
const UNREACHABLE = 'postgres://crash:crash@127.0.0.1:1/crash_game_test';

describe('MikroOrmDatabasePing (D105)', () => {
  it('HC3: rejeita quando o banco recusa a conexão', async () => {
    const orm = await MikroORM.init(ormOptions(UNREACHABLE));
    try {
      await expect(new MikroOrmDatabasePing(orm).ping()).rejects.toThrow();
    } finally {
      await orm.close();
    }
  });
});
