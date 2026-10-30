import type { MikroORM } from '@mikro-orm/postgresql';
import type { DatabasePing } from '../http/health.js';

/** `select 1` no banco, para o `GET /health` (D105). */
export class MikroOrmDatabasePing implements DatabasePing {
  constructor(private readonly orm: MikroORM) {}

  async ping(): Promise<void> {
    await this.orm.em.getConnection().execute('select 1');
  }
}
