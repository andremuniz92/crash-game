import { MikroORM } from '@mikro-orm/postgresql';
import { ormOptions } from './orm-options.js';

/**
 * Aplica as migrations pendentes e fecha o ORM (D104). Devolve os nomes das
 * migrations aplicadas, na ordem; vazio se o banco já estava em dia.
 */
export async function runMigrations(clientUrl: string): Promise<string[]> {
  const orm = await MikroORM.init(ormOptions(clientUrl));
  try {
    const applied = await orm.migrator.up();
    return applied.map((migration) => migration.name);
  } finally {
    await orm.close();
  }
}
