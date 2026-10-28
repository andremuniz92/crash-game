import { timeToCrash } from '@crash/shared';
import {
  deferred,
  insertPlayer,
  waitForBlockedLock,
} from '../../../test/integration/fixtures.js';
import { testOrm } from '../../../test/integration/test-orm.js';
import { Bet } from '../../bets/domain/bet.js';
import { MikroOrmBetRepository } from '../../bets/infrastructure/mikro-orm-bet.repository.js';
import type { PublishedEvent } from '../../shared/application/event-publisher.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import { Money } from '../../shared/domain/money.js';
import {
  MikroOrmUnitOfWork,
  type TransactionScope,
} from '../../shared/infrastructure/database/mikro-orm-unit-of-work.js';
import { FakeClock } from '../../shared/testing/fake-clock.js';
import { Round } from '../domain/round.js';
import type { RoundCrashed } from '../domain/round-events.js';
import { ServerSeed } from '../domain/server-seed.js';
import { MikroOrmRoundRepository } from '../infrastructure/mikro-orm-round.repository.js';
import { GameLoopStep } from './game-loop-step.js';

/* Vetores do M1 (round.spec.ts). */
const LOW = {
  seed: '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad',
  id: '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60',
  crashPoint: 126,
  timeToCrash: 3_852,
};
const HIGH = {
  seed: 'dabbdcfa82ee4f2e349ef253955ca74a8cdc6abde9f63f87840a9659bf665921',
  id: '11111111-2222-4333-8444-000000000004',
  crashPoint: 1_585,
  timeToCrash: 46_053,
};
const INSTANT = {
  seed: '4ea5e13de9e0aa99a3c8cb6c5ea849b44783b31f8a6056062203142341f07dfe',
  id: '00000000-0000-4000-8000-000000000034',
  crashPoint: 100,
  timeToCrash: 0,
};
type Vector = typeof LOW;

const BETTING_MS = 10_000;
const PAUSE_MS = 3_000;
const T0 = Date.parse('2026-10-28T12:00:00.000Z');
const P1 = 'f1f1f1f1-0000-4000-8000-000000000001';
const P2 = 'f1f1f1f1-0000-4000-8000-000000000002';
const BET_1 = 'f2f2f2f2-0000-4000-8000-000000000001';
const BET_2 = 'f2f2f2f2-0000-4000-8000-000000000002';

/** Passo com relógio falso, ids e seeds na ordem dos vetores e eventos gravados. */
async function setup(
  vectors: Vector[],
  now: number,
  uow?: UnitOfWork<TransactionScope>,
) {
  const clock = new FakeClock(now);
  const published: PublishedEvent[] = [];
  const ids = [...vectors];
  const seeds = [...vectors];
  const step = new GameLoopStep(
    uow ?? new MikroOrmUnitOfWork(await testOrm()),
    clock,
    { newId: () => ids.shift()!.id },
    { newSeed: () => ServerSeed.fromHex(seeds.shift()!.seed) },
    { publish: (events) => published.push(...events) },
    { bettingMs: BETTING_MS, pauseMs: PAUSE_MS },
  );
  return { step, clock, published };
}

function newRound(vector: Vector, bettingEndsAt: number): Round {
  return Round.create({
    id: vector.id,
    serverSeed: ServerSeed.fromHex(vector.seed),
    bettingEndsAt,
  });
}

async function saveRound(round: Round): Promise<void> {
  round.pullEvents();
  await new MikroOrmRoundRepository((await testOrm()).em.fork()).save(round);
}

async function saveBet(bet: Bet): Promise<void> {
  await new MikroOrmBetRepository((await testOrm()).em.fork()).save(bet);
}

async function loadRound(id: string): Promise<Round | null> {
  return new MikroOrmRoundRepository((await testOrm()).em.fork()).findById(id);
}

async function loadBet(id: string): Promise<Bet | null> {
  const rows = await new MikroOrmBetRepository(
    (await testOrm()).em.fork(),
  ).findByRound(LOW.id);
  return rows.find((bet) => bet.id === id) ?? null;
}

async function countOpenRounds(): Promise<number> {
  const [row] = await (
    await testOrm()
  ).em
    .getConnection()
    .execute<{ n: number }[]>(
      `select count(*)::int as n from rounds where status <> 'CRASHED'`,
    );
  return row?.n ?? 0;
}

/**
 * Rodada LOW em RUNNING desde T0, com duas apostas: P1 pendente e P2 com
 * cash out em T0 + 1 s.
 */
async function runningRoundWithBets(): Promise<Round> {
  const orm = await testOrm();
  await insertPlayer(orm, P1);
  await insertPlayer(orm, P2);
  const round = newRound(LOW, T0);
  const amount = Money.fromCents(1_000);
  const pending = Bet.place({
    id: BET_1,
    round,
    playerId: P1,
    amount,
    now: T0 - 1,
  });
  const cashed = Bet.place({
    id: BET_2,
    round,
    playerId: P2,
    amount,
    now: T0 - 1,
  });
  round.start(T0);
  cashed.cashOut({ round, now: T0 + 1_000 });
  await saveRound(round);
  await saveBet(pending);
  await saveBet(cashed);
  return round;
}

describe('GameLoopStep (D61)', () => {
  it('G1: sem rodada, cria uma em BETTING e publica RoundCreated', async () => {
    const { step, published } = await setup([LOW], T0);

    expect(await step.execute()).toEqual({ waitMs: BETTING_MS });

    const round = await loadRound(LOW.id);
    expect(round?.status).toBe('BETTING');
    expect(round?.bettingEndsAt).toBe(T0 + BETTING_MS);
    const seedHash = ServerSeed.fromHex(LOW.seed).hash();
    expect(round?.seedHash.equals(seedHash)).toBe(true);
    expect(published).toEqual([
      {
        type: 'RoundCreated',
        roundId: LOW.id,
        seedHash,
        bettingEndsAt: T0 + BETTING_MS,
      },
    ]);
  });

  it('G2: BETTING antes do prazo não muda nada e devolve o tempo restante', async () => {
    await saveRound(newRound(LOW, T0 + BETTING_MS));
    const { step, published } = await setup([], T0 + 4_000);

    expect(await step.execute()).toEqual({ waitMs: BETTING_MS - 4_000 });
    expect((await loadRound(LOW.id))?.status).toBe('BETTING');
    expect(published).toEqual([]);
  });

  it('G3: BETTING vencida (boot) inicia com startedAt = now e publica RoundStarted', async () => {
    await saveRound(newRound(HIGH, T0));
    const now = T0 + 60_000;
    const { step, published } = await setup([], now);

    expect(await step.execute()).toEqual({ waitMs: HIGH.timeToCrash });

    const round = await loadRound(HIGH.id);
    expect(round?.status).toBe('RUNNING');
    expect(round?.startedAt).toBe(now);
    expect(published).toEqual([
      { type: 'RoundStarted', roundId: HIGH.id, startedAt: now },
    ]);
  });

  it('G4: RUNNING antes de crashAt não muda nada e devolve o tempo restante', async () => {
    const round = newRound(HIGH, T0);
    round.start(T0);
    await saveRound(round);
    const { step, published } = await setup([], T0 + 10_000);

    expect(await step.execute()).toEqual({
      waitMs: HIGH.timeToCrash - 10_000,
    });
    expect((await loadRound(HIGH.id))?.status).toBe('RUNNING');
    expect(published).toEqual([]);
  });

  it('G5: RUNNING vencida (boot) crasha, liquida só as pendentes e publica os eventos', async () => {
    await runningRoundWithBets();
    const now = T0 + 60_000;
    const { step, published } = await setup([], now);

    expect(await step.execute()).toEqual({ waitMs: PAUSE_MS });

    const round = await loadRound(LOW.id);
    expect(round?.status).toBe('CRASHED');
    expect(round?.crashedAt).toBe(now);
    expect((await loadBet(BET_1))?.status).toBe('LOST');
    expect((await loadBet(BET_2))?.status).toBe('CASHED_OUT');
    expect(published).toEqual([
      {
        type: 'RoundCrashed',
        roundId: LOW.id,
        crashPoint: expect.objectContaining({ x100: LOW.crashPoint }),
        serverSeed: expect.objectContaining({}),
        crashedAt: now,
      },
      { type: 'BetsSettled', roundId: LOW.id, lostBetIds: [BET_1] },
    ]);
    const crashed = published[0] as RoundCrashed;
    expect(crashed.serverSeed.toHex()).toBe(LOW.seed);
  });

  it('G6 e G7: ciclo completo pelo waitMs devolvido, uma rodada aberta por vez e uma leitura do relógio por passo', async () => {
    const { step, clock, published } = await setup([LOW, HIGH], T0);
    const now = vi.spyOn(clock, 'now');

    const waits: number[] = [];
    for (let i = 0; i < 4; i++) {
      const { waitMs } = await step.execute();
      waits.push(waitMs);
      expect(await countOpenRounds()).toBeLessThanOrEqual(1);
      clock.advance(waitMs);
    }

    expect(waits).toEqual([BETTING_MS, LOW.timeToCrash, PAUSE_MS, BETTING_MS]);
    expect(published.map((event) => event.type)).toEqual([
      'RoundCreated',
      'RoundStarted',
      'RoundCrashed',
      'BetsSettled',
      'RoundCreated',
    ]);
    expect((await loadRound(LOW.id))?.status).toBe('CRASHED');
    expect((await loadRound(HIGH.id))?.status).toBe('BETTING');
    expect(now).toHaveBeenCalledTimes(4);
  });

  it('G8: se a liquidação falhar, nada é gravado, nada é publicado e o erro sobe', async () => {
    await runningRoundWithBets();
    const real = new MikroOrmUnitOfWork(await testOrm());
    const failure = new Error('falhou na liquidação');
    const { step, published } = await setup([], T0 + 60_000, {
      run: (work) =>
        real.run((tx) =>
          work({
            ...tx,
            settlement: { settle: () => Promise.reject(failure) },
          }),
        ),
    });

    await expect(step.execute()).rejects.toBe(failure);
    expect((await loadRound(LOW.id))?.status).toBe('RUNNING');
    expect((await loadBet(BET_1))?.status).toBe('PENDING');
    expect(published).toEqual([]);
  });

  it('G9: crash instantâneo (1,00x): o start devolve waitMs 0 e o passo seguinte crasha', async () => {
    expect(timeToCrash(INSTANT.crashPoint)).toBe(0);
    const { step, clock } = await setup([INSTANT], T0);

    await step.execute();
    clock.advance(BETTING_MS);
    expect(await step.execute()).toEqual({ waitMs: 0 });
    expect(await step.execute()).toEqual({ waitMs: PAUSE_MS });

    const round = await loadRound(INSTANT.id);
    expect(round?.status).toBe('CRASHED');
    expect(round?.revealCrashPoint().x100).toBe(100);
    expect(round?.crashedAt).toBe(T0 + BETTING_MS);
  });
});

describe('GameLoopStep: concorrência com a rodada (D57, D54)', () => {
  it('C1: o crash espera o cash out em andamento, e a aposta continua CASHED_OUT', async () => {
    const orm = await testOrm();
    await runningRoundWithBets();
    const { step, published } = await setup([], T0 + 60_000);
    const t1Locked = deferred();
    const releaseT1 = deferred();
    const order: string[] = [];

    // Cash out de P1 em T0 + 2 s, na ordem da D57: rodada FOR SHARE, aposta FOR UPDATE.
    const cashOut = orm.em.fork().transactional(async (em) => {
      const round = await new MikroOrmRoundRepository(em).findByIdForShare(
        LOW.id,
      );
      const bets = new MikroOrmBetRepository(em);
      const bet = await bets.getByIdAndPlayerForUpdate(BET_1, P1);
      bet!.cashOut({ round: round!, now: T0 + 2_000 });
      order.push('cashout:locked');
      t1Locked.resolve();
      await releaseT1.promise;
      await bets.save(bet!);
      order.push('cashout:commit');
    });
    await t1Locked.promise;

    let crash: Promise<unknown> | undefined;
    try {
      crash = step.execute().then(() => order.push('crash:done'));
      await waitForBlockedLock(orm);
      order.push('crash:waiting');
    } finally {
      releaseT1.resolve();
      await Promise.allSettled([cashOut, crash]);
    }
    await Promise.all([cashOut, crash]);

    expect(order).toEqual([
      'cashout:locked',
      'crash:waiting',
      'cashout:commit',
      'crash:done',
    ]);
    expect((await loadBet(BET_1))?.status).toBe('CASHED_OUT');
    expect(published).toContainEqual({
      type: 'BetsSettled',
      roundId: LOW.id,
      lostBetIds: [],
    });
  });

  it('C2: o start espera a aposta em andamento, e a aposta fica na rodada', async () => {
    const orm = await testOrm();
    await insertPlayer(orm, P1);
    await saveRound(newRound(LOW, T0));
    const { step } = await setup([], T0 + 1);
    const t1Locked = deferred();
    const releaseT1 = deferred();
    const order: string[] = [];

    // Aposta de P1 em T0 − 1, na ordem da D57: rodada FOR SHARE antes de gravar.
    const placeBet = orm.em.fork().transactional(async (em) => {
      const round = await new MikroOrmRoundRepository(em).findCurrentForShare();
      const bet = Bet.place({
        id: BET_1,
        round: round!,
        playerId: P1,
        amount: Money.fromCents(1_000),
        now: T0 - 1,
      });
      order.push('bet:locked');
      t1Locked.resolve();
      await releaseT1.promise;
      await new MikroOrmBetRepository(em).save(bet);
      order.push('bet:commit');
    });
    await t1Locked.promise;

    let start: Promise<unknown> | undefined;
    try {
      start = step.execute().then(() => order.push('start:done'));
      await waitForBlockedLock(orm);
      order.push('start:waiting');
    } finally {
      releaseT1.resolve();
      await Promise.allSettled([placeBet, start]);
    }
    await Promise.all([placeBet, start]);

    expect(order).toEqual([
      'bet:locked',
      'start:waiting',
      'bet:commit',
      'start:done',
    ]);
    expect((await loadRound(LOW.id))?.status).toBe('RUNNING');
    expect((await loadBet(BET_1))?.roundId).toBe(LOW.id);
  });
});
