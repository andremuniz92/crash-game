import type { MikroORM } from '@mikro-orm/postgresql';
import { Round } from '../../src/rounds/domain/round.js';
import { ServerSeed } from '../../src/rounds/domain/server-seed.js';
import { MikroOrmRoundRepository } from '../../src/rounds/infrastructure/mikro-orm-round.repository.js';
import type {
  EventPublisher,
  PublishedEvent,
} from '../../src/shared/application/event-publisher.js';
import { Wallet } from '../../src/wallet/domain/wallet.js';
import { MikroOrmWalletRepository } from '../../src/wallet/infrastructure/mikro-orm-wallet.repository.js';
import { insertPlayer } from './fixtures.js';

/* Vetores do M1 (round.spec.ts): crash point ×100 e ms até o crash. */
export const LOW = {
  seed: '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad',
  id: '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60',
  crashPoint: 126,
  timeToCrash: 3_852,
};
export const HIGH = {
  seed: 'dabbdcfa82ee4f2e349ef253955ca74a8cdc6abde9f63f87840a9659bf665921',
  id: '11111111-2222-4333-8444-000000000004',
  crashPoint: 1_585,
  timeToCrash: 46_053,
};
export type Vector = typeof LOW;

/** Jogador com a carteira aberta (100.000 centavos e o INITIAL_GRANT). */
export async function playerWithWallet(
  orm: MikroORM,
  playerId: string,
  now: number,
): Promise<void> {
  await insertPlayer(orm, playerId);
  await orm.em
    .fork()
    .transactional((em) =>
      new MikroOrmWalletRepository(em).save(Wallet.open({ playerId, now })),
    );
}

export function newRound(vector: Vector, bettingEndsAt: number): Round {
  return Round.create({
    id: vector.id,
    serverSeed: ServerSeed.fromHex(vector.seed),
    bettingEndsAt,
  });
}

export async function saveRound(orm: MikroORM, round: Round): Promise<void> {
  round.pullEvents();
  await new MikroOrmRoundRepository(orm.em.fork()).save(round);
}

/** Carrega a rodada, aplica a mudança e grava, como o game loop faria. */
export async function changeRound(
  orm: MikroORM,
  id: string,
  change: (round: Round) => void,
): Promise<void> {
  const round = await new MikroOrmRoundRepository(orm.em.fork()).findById(id);
  change(round!);
  await saveRound(orm, round!);
}

export function recordingPublisher(): EventPublisher & {
  published: PublishedEvent[];
} {
  const published: PublishedEvent[] = [];
  return { published, publish: (events) => published.push(...events) };
}

export async function query<T>(
  orm: MikroORM,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return orm.em.getConnection().execute<T[]>(sql, params);
}

/** Saldo, versão e soma do extrato do jogador; a invariante da seção 6.4 pede saldo = soma. */
export async function walletState(
  orm: MikroORM,
  playerId: string,
): Promise<{ balance: number; version: number; ledgerSum: number }> {
  const [row] = await query<{
    balance: number;
    version: number;
    ledger_sum: number;
  }>(
    orm,
    `select w.balance::int as balance, w.version,
            (select coalesce(sum(amount), 0)::int from ledger_entries l
              where l.player_id = w.player_id) as ledger_sum
       from wallets w where w.player_id = ?`,
    [playerId],
  );
  return {
    balance: row!.balance,
    version: row!.version,
    ledgerSum: row!.ledger_sum,
  };
}

export async function count(
  orm: MikroORM,
  table: string,
  where = 'true',
  params: unknown[] = [],
): Promise<number> {
  const [row] = await query<{ n: number }>(
    orm,
    `select count(*)::int as n from ${table} where ${where}`,
    params,
  );
  return row?.n ?? 0;
}
