import type { MikroORM } from '@mikro-orm/postgresql';
import { BetRecord } from '../../src/bets/infrastructure/bet.record.js';
import { PlayerRecord } from '../../src/players/player.record.js';
import { RoundRecord } from '../../src/rounds/infrastructure/round.record.js';

/** Jogador mínimo para satisfazer as FKs; o repositório de jogadores é do M3. */
export async function insertPlayer(orm: MikroORM, id: string): Promise<void> {
  await orm.em.fork().insert(PlayerRecord, {
    id,
    nickname: 'jogador',
    tokenHash: id.replaceAll('-', '').padEnd(64, '0'),
    createdAt: new Date(),
  });
}

export interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Espera até o Postgres ter uma transação parada esperando um lock (D54).
 * Consulta o próprio banco em vez de dormir um tempo fixo.
 */
export async function waitForBlockedLock(
  orm: MikroORM,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await orm.em.getConnection().execute<{ n: number }[]>(
      // Lock de linha aparece como locktype = transactionid, com database nulo;
      // por isso o filtro pelo banco passa pela sessão que está esperando.
      `select count(*)::int as n
           from pg_locks l join pg_stat_activity a on a.pid = l.pid
          where not l.granted and a.datname = current_database()`,
    );
    if ((row?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('nenhuma transação ficou esperando lock');
}

/**
 * Cria `count` apostas reais do jogador para satisfazer a FK de
 * ledger_entries.bet_id. Uma rodada crashada por aposta, porque o
 * UNIQUE (round_id, player_id) só permite uma aposta do jogador por rodada.
 */
export async function insertBetsFor(
  orm: MikroORM,
  playerId: string,
  count: number,
): Promise<string[]> {
  const em = orm.em.fork();
  const now = new Date();
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const suffix = String(i).padStart(12, '0');
    const roundId = `aaaaaaaa-0000-4000-8000-${suffix}`;
    const betId = `bbbbbbbb-0000-4000-8000-${suffix}`;
    await em.insert(RoundRecord, {
      id: roundId,
      status: 'CRASHED',
      serverSeed: 'a'.repeat(64),
      seedHash: 'a'.repeat(64),
      crashPoint: 150,
      bettingEndsAt: now,
      startedAt: now,
      crashAt: now,
      crashedAt: now,
    });
    await em.insert(BetRecord, {
      id: betId,
      roundId,
      playerId,
      amount: 1_000,
      status: 'LOST',
      cashoutMultiplier: null,
      payout: null,
      createdAt: now,
    });
    ids.push(betId);
  }
  return ids;
}
