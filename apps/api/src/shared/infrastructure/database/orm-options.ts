import { fileURLToPath } from 'node:url';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig, type Options } from '@mikro-orm/postgresql';
import { BetRecord } from '../../../bets/infrastructure/bet.record.js';
import { PlayerRecord } from '../../../players/player.record.js';
import { RoundRecord } from '../../../rounds/infrastructure/round.record.js';
import { LedgerEntryRecord } from '../../../wallet/infrastructure/ledger-entry.record.js';
import { WalletRecord } from '../../../wallet/infrastructure/wallet.record.js';
import { IdempotencyKeyRecord } from '../idempotency/idempotency-key.record.js';

/** Todos os registros de persistência (D41). */
export const RECORDS = [
  PlayerRecord,
  WalletRecord,
  LedgerEntryRecord,
  RoundRecord,
  BetRecord,
  IdempotencyKeyRecord,
];

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
    entities: RECORDS,
    forceUtcTimezone: true,
    ensureDatabase: false,
    extensions: [Migrator],
    migrations: {
      path: MIGRATIONS_PATH,
      tableName: 'mikro_orm_migrations',
      // Nome fixo, independente do nome do banco de cada ambiente.
      snapshotName: '.snapshot',
      transactional: true,
      allOrNothing: true,
    },
    ...overrides,
  });
}
