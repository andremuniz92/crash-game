import { fileURLToPath } from 'node:url';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig, type Options } from '@mikro-orm/postgresql';

/**
 * Pasta das migrations, relativa a este arquivo: `src/migrations` quando roda
 * em TypeScript (tsx, Vitest) e `dist/migrations` depois do build.
 */
const MIGRATIONS_PATH = fileURLToPath(
  new URL('../../../migrations', import.meta.url),
);

/**
 * Opções comuns do MikroORM (D41, D42, D44). Quem chama decide a URL e se o
 * banco pode ser criado: a aplicação e a CLI nunca criam; o setup dos testes cria.
 */
export function ormOptions(
  clientUrl: string,
  overrides: Pick<Options, 'ensureDatabase'> = {},
): Options {
  return defineConfig({
    clientUrl,
    entities: [], // registros entram na Fase 3
    discovery: { warnWhenNoEntities: false },
    forceUtcTimezone: true,
    ensureDatabase: false,
    extensions: [Migrator],
    migrations: {
      path: MIGRATIONS_PATH,
      tableName: 'mikro_orm_migrations',
      transactional: true,
      allOrNothing: true,
    },
    ...overrides,
  });
}
