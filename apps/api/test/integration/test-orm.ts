import { MikroORM } from '@mikro-orm/postgresql';
import { readTestDatabaseConfig } from '../../src/shared/infrastructure/database/database-config.js';
import { ormOptions } from '../../src/shared/infrastructure/database/orm-options.js';

const MIGRATIONS_TABLE = 'mikro_orm_migrations';

/** O ORM dos testes, para os specs de domain/ e application/ não importarem o MikroORM (D55). */
export type TestOrm = MikroORM;

/** ORM apontando para o banco de teste; `readTestDatabaseConfig` garante o sufixo _test (D40). */
export function initTestOrm(
  options: { createDatabase?: boolean } = {},
): Promise<MikroORM> {
  const { clientUrl } = readTestDatabaseConfig(process.env);
  return MikroORM.init(
    ormOptions(clientUrl, {
      ensureDatabase: options.createDatabase ? { create: false } : false,
    }),
  );
}

let shared: Promise<MikroORM> | undefined;

/** Um ORM por arquivo de teste, fechado no afterAll do setup. */
export function testOrm(): Promise<MikroORM> {
  shared ??= initTestOrm();
  return shared;
}

export async function closeTestOrm(): Promise<void> {
  if (!shared) return;
  const orm = await shared;
  shared = undefined;
  await orm.close();
}

/** Esvazia todas as tabelas do schema public, menos a de controle das migrations. */
export async function truncateAll(orm: MikroORM): Promise<void> {
  const connection = orm.em.getConnection();
  const rows = await connection.execute<{ tablename: string }[]>(
    `select tablename from pg_tables where schemaname = 'public' and tablename <> ?`,
    [MIGRATIONS_TABLE],
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  await connection.execute(`truncate table ${tables} restart identity cascade`);
}
