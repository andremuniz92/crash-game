import {
  CheckConstraintViolationException,
  ForeignKeyConstraintViolationException,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { BetRecord } from '../../src/bets/infrastructure/bet.record.js';
import { PlayerRecord } from '../../src/players/player.record.js';
import { RoundRecord } from '../../src/rounds/infrastructure/round.record.js';
import { IdempotencyKeyRecord } from '../../src/shared/infrastructure/idempotency/idempotency-key.record.js';
import { LedgerEntryRecord } from '../../src/wallet/infrastructure/ledger-entry.record.js';
import { WalletRecord } from '../../src/wallet/infrastructure/wallet.record.js';
import { testOrm } from './test-orm.js';

/*
 * Schema da migration inicial (seção 9, D42, D49). As linhas inválidas são
 * inseridas direto pelos registros, sem passar pelo domínio, para provar que
 * o banco recusa sozinho.
 */

const PLAYER = '00000000-0000-4000-8000-000000000001';
const OTHER_PLAYER = '00000000-0000-4000-8000-000000000002';
const ROUND = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ROUND = '00000000-0000-4000-8000-0000000000a2';
const BET = '00000000-0000-4000-8000-0000000000b1';
const MISSING = '00000000-0000-4000-8000-0000000000ff';
const HEX_64 = 'a'.repeat(64);
const NOW = new Date('2026-10-27T12:00:00.000Z');

const TABLES = [
  'players',
  'wallets',
  'ledger_entries',
  'rounds',
  'bets',
  'idempotency_keys',
];

async function em(): Promise<EntityManager> {
  return (await testOrm()).em.fork() as EntityManager;
}

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await em()).getConnection().execute<T[]>(sql, params);
}

async function insertPlayer(
  id = PLAYER,
  tokenHash = `${id.slice(-2)}${HEX_64}`.slice(0, 64),
): Promise<void> {
  await (
    await em()
  ).insert(PlayerRecord, {
    id,
    nickname: 'jogador',
    tokenHash,
    createdAt: NOW,
  });
}

async function insertRound(
  id = ROUND,
  overrides: Partial<{
    status: 'BETTING' | 'RUNNING' | 'CRASHED';
    crashPoint: number;
  }> = {},
): Promise<void> {
  const status = overrides.status ?? 'CRASHED';
  await (
    await em()
  ).insert(RoundRecord, {
    id,
    status,
    serverSeed: HEX_64,
    seedHash: HEX_64,
    crashPoint: overrides.crashPoint ?? 150,
    bettingEndsAt: NOW,
    startedAt: status === 'BETTING' ? null : NOW,
    crashAt: status === 'BETTING' ? null : NOW,
    crashedAt: status === 'CRASHED' ? NOW : null,
  });
}

async function insertBet(
  overrides: Partial<{
    id: string;
    roundId: string;
    playerId: string;
    amount: number;
    cashoutMultiplier: number | null;
  }> = {},
): Promise<void> {
  await (
    await em()
  ).insert(BetRecord, {
    id: overrides.id ?? BET,
    roundId: overrides.roundId ?? ROUND,
    playerId: overrides.playerId ?? PLAYER,
    amount: overrides.amount ?? 1_000,
    status: 'PENDING',
    cashoutMultiplier: overrides.cashoutMultiplier ?? null,
    payout: null,
    createdAt: NOW,
  });
}

describe('schema: migration inicial', () => {
  it('as migrations estão aplicadas, carregadas pelo Vitest a partir dos arquivos .ts', async () => {
    const rows = await query<{ name: string }>(
      'select name from mikro_orm_migrations order by id',
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.name).toMatch(/^Migration\d{14}$/);
  });

  it('M2: é reversível: down até o início e up de novo voltam ao mesmo schema', async () => {
    const orm = await testOrm();
    const exists = async () =>
      (
        await query<{ name: string | null }>(
          `select ${TABLES.map((t) => `to_regclass('public.${t}')::text as "${t}"`).join(', ')}`,
        )
      )[0];

    await orm.migrator.down({ to: 0 });
    expect(Object.values((await exists()) ?? {})).toEqual(
      TABLES.map(() => null),
    );

    await orm.migrator.up();
    expect(Object.values((await exists()) ?? {})).toEqual(TABLES);
  });

  it('usa bigint para dinheiro, integer para multiplicadores e timestamptz para datas', async () => {
    const rows = await query<{ col: string; data_type: string }>(
      `select table_name || '.' || column_name as col, data_type
         from information_schema.columns where table_schema = 'public'`,
    );
    const types = Object.fromEntries(rows.map((r) => [r.col, r.data_type]));

    for (const col of [
      'wallets.balance',
      'ledger_entries.amount',
      'bets.amount',
      'bets.payout',
    ]) {
      expect(types[col], col).toBe('bigint');
    }
    for (const col of ['rounds.crash_point', 'bets.cashout_multiplier']) {
      expect(types[col], col).toBe('integer');
    }
    for (const col of [
      'rounds.betting_ends_at',
      'rounds.crashed_at',
      'bets.created_at',
      'ledger_entries.created_at',
    ]) {
      expect(types[col], col).toBe('timestamp with time zone');
    }
    expect(types['idempotency_keys.response_body']).toBe('jsonb');
  });

  it('M1: idempotency_keys.request_hash é varchar(64) not null (D60)', async () => {
    const [column] = await query<{
      data_type: string;
      character_maximum_length: number;
      is_nullable: string;
    }>(
      `select data_type, character_maximum_length, is_nullable
         from information_schema.columns
        where table_schema = 'public' and table_name = 'idempotency_keys'
          and column_name = 'request_hash'`,
    );
    expect(column).toEqual({
      data_type: 'character varying',
      character_maximum_length: 64,
      is_nullable: 'NO',
    });
  });
});

describe('schema: restrições', () => {
  it('UNIQUE (round_id, player_id) recusa uma segunda aposta do jogador na rodada', async () => {
    await insertPlayer();
    await insertRound();
    await insertBet();
    await expect(
      insertBet({ id: '00000000-0000-4000-8000-0000000000b2' }),
    ).rejects.toThrow(UniqueConstraintViolationException);
  });

  it('CHECK (balance >= 0) recusa saldo negativo', async () => {
    await insertPlayer();
    await expect(
      (await em()).insert(WalletRecord, {
        playerId: PLAYER,
        balance: -1,
        version: 0,
      }),
    ).rejects.toThrow(CheckConstraintViolationException);
  });

  it('token_hash é único e a PK de idempotency_keys é (player_id, key)', async () => {
    await insertPlayer(PLAYER, HEX_64);
    await expect(insertPlayer(OTHER_PLAYER, HEX_64)).rejects.toThrow(
      UniqueConstraintViolationException,
    );

    const key = {
      playerId: PLAYER,
      key: '00000000-0000-4000-8000-0000000000c1',
      endpoint: 'POST /bets',
      requestHash: 'a'.repeat(64),
      responseStatus: 201,
      responseBody: { ok: true },
      createdAt: NOW,
    };
    await (await em()).insert(IdempotencyKeyRecord, key);
    await expect(
      (await em()).insert(IdempotencyKeyRecord, key),
    ).rejects.toThrow(UniqueConstraintViolationException);
  });

  it('as FKs recusam aposta com rodada ou jogador inexistente e lançamento com aposta inexistente', async () => {
    await insertPlayer();
    await insertRound();
    await expect(insertBet({ roundId: MISSING })).rejects.toThrow(
      ForeignKeyConstraintViolationException,
    );
    await expect(insertBet({ playerId: MISSING })).rejects.toThrow(
      ForeignKeyConstraintViolationException,
    );
    await expect(
      (await em()).insert(LedgerEntryRecord, {
        playerId: PLAYER,
        type: 'BET_PLACED',
        amount: -1_000,
        betId: MISSING,
        createdAt: NOW,
      }),
    ).rejects.toThrow(ForeignKeyConstraintViolationException);
  });

  it('tem os índices da seção 9', async () => {
    const rows = await query<{ indexdef: string }>(
      `select indexdef from pg_indexes where schemaname = 'public'`,
    );
    const defs = rows.map((r) => r.indexdef);
    for (const expected of [
      /ON public\.ledger_entries USING btree \(player_id, created_at\)/,
      /ON public\.rounds USING btree \(status\)/,
      /ON public\.rounds USING btree \(crashed_at\)/,
    ]) {
      expect(
        defs.some((def) => expected.test(def)),
        String(expected),
      ).toBe(true);
    }
  });

  it('ledger_entries.id é gerado pelo banco e cresce', async () => {
    await insertPlayer();
    const entry = {
      playerId: PLAYER,
      type: 'INITIAL_GRANT' as const,
      amount: 100_000,
      betId: null,
      createdAt: NOW,
    };
    await (await em()).insert(LedgerEntryRecord, entry);
    await (await em()).insert(LedgerEntryRecord, entry);
    const rows = await query<{ id: string }>(
      'select id from ledger_entries order by id',
    );
    const ids = rows.map((r) => Number(r.id));
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBeGreaterThan(ids[0]!);
  });

  it('recusa uma segunda rodada não crashada; várias crashadas convivem', async () => {
    await insertRound(ROUND, { status: 'CRASHED' });
    await insertRound(OTHER_ROUND, { status: 'CRASHED' });
    await insertRound('00000000-0000-4000-8000-0000000000a3', {
      status: 'BETTING',
    });
    await expect(
      insertRound('00000000-0000-4000-8000-0000000000a4', {
        status: 'RUNNING',
      }),
    ).rejects.toThrow(UniqueConstraintViolationException);
  });

  it('os CHECK de faixa recusam amount = 0, crash_point = 99 e cashout_multiplier acima do teto', async () => {
    await insertPlayer();
    await insertRound();
    await expect(insertBet({ amount: 0 })).rejects.toThrow(
      CheckConstraintViolationException,
    );
    await expect(insertRound(OTHER_ROUND, { crashPoint: 99 })).rejects.toThrow(
      CheckConstraintViolationException,
    );
    await expect(insertBet({ cashoutMultiplier: 100_000_001 })).rejects.toThrow(
      CheckConstraintViolationException,
    );
  });
});

describe('isolamento entre testes (D40)', () => {
  it('um teste insere um jogador', async () => {
    await insertPlayer();
    const rows = await query<{ n: number }>(
      'select count(*)::int as n from players',
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('o teste seguinte encontra as tabelas vazias', async () => {
    for (const table of TABLES) {
      const rows = await query<{ n: number }>(
        `select count(*)::int as n from ${table}`,
      );
      expect(rows[0]?.n, table).toBe(0);
    }
  });
});
