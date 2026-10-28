import { createHash } from 'node:crypto';
import type {
  CurrentRoundResponse,
  GuestResponse,
  RoundHistoryItem,
  VerifyResponse,
} from '@crash/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Bet } from '../../src/bets/domain/bet.js';
import { MikroOrmBetRepository } from '../../src/bets/infrastructure/mikro-orm-bet.repository.js';
import { GameLoopStep } from '../../src/rounds/application/game-loop-step.js';
import { MikroOrmRoundRepository } from '../../src/rounds/infrastructure/mikro-orm-round.repository.js';
import { Money } from '../../src/shared/domain/money.js';
import { FakeClock } from '../../src/shared/testing/fake-clock.js';
import { testOrm } from '../integration/test-orm.js';
import {
  BETTING_MS,
  createTestApp,
  PAUSE_MS,
  QueuedGenerators,
} from './test-app.js';

/* Vetores do M1 (round.spec.ts): crash point ×100 e ms até o crash. */
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
type Vector = typeof LOW;

const T0 = Date.parse('2026-10-28T12:00:00.000Z');
const sha256 = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/** Todos os números de um JSON, em qualquer profundidade. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(numbersIn);
}

describe('rodadas (E2E, D63)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;
  let generators: QueuedGenerators;
  let step: GameLoopStep;

  beforeEach(async () => {
    clock = new FakeClock(T0);
    generators = new QueuedGenerators();
    app = await createTestApp({ clock, generators });
    step = app.get(GameLoopStep);
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function current(token?: string) {
    const call = http().get('/rounds/current');
    if (token) call.set('Authorization', `Bearer ${token}`);
    const response = await call.expect(200);
    return { body: response.body as CurrentRoundResponse, text: response.text };
  }

  /** Abre a rodada do vetor e devolve o instante em que as apostas fecham. */
  async function open(vector: Vector): Promise<number> {
    generators.enqueueRound(vector);
    await step.execute();
    return clock.now() + BETTING_MS;
  }

  async function startAndCrash(vector: Vector): Promise<void> {
    clock.advance(BETTING_MS);
    await step.execute();
    clock.advance(vector.timeToCrash);
    await step.execute();
  }

  /** Nenhuma chave, valor ou número que revele o resultado (D30). */
  function expectNoSecrets(
    { body, text }: { body: unknown; text: string },
    vector: Vector,
    crashAt: number | null,
  ) {
    for (const key of ['crashPoint', 'crashAt', 'serverSeed']) {
      expect(text).not.toContain(`"${key}"`);
    }
    expect(text).not.toContain(vector.seed);
    expect(numbersIn(body)).not.toContain(vector.crashPoint);
    if (crashAt !== null) {
      expect(numbersIn(body)).not.toContain(crashAt);
      expect(text).not.toContain(String(crashAt));
    }
  }

  it('X10: GET /rounds/current não revela crashPoint, crashAt nem a seed em BETTING e em RUNNING', async () => {
    const bettingEndsAt = await open(LOW);
    const seedHash = sha256(LOW.seed);

    const betting = await current();
    expect(betting.body.round).toEqual({
      id: LOW.id,
      status: 'BETTING',
      seedHash,
      bettingEndsAt,
    });
    expectNoSecrets(betting, LOW, null);

    clock.advance(BETTING_MS);
    await step.execute();
    const startedAt = clock.now();
    const crashAt = startedAt + LOW.timeToCrash;

    const running = await current();
    expect(running.body.round).toEqual({
      id: LOW.id,
      status: 'RUNNING',
      seedHash,
      bettingEndsAt,
      startedAt,
    });
    expect(running.body.serverTime).toBe(startedAt);
    expectNoSecrets(running, LOW, crashAt);
  });

  it('X11: antes da primeira rodada, round é null; depois do crash, vem a última crashada já revelada', async () => {
    expect((await current()).body).toEqual({
      round: null,
      bets: [],
      myBet: null,
      serverTime: T0,
    });

    const bettingEndsAt = await open(LOW);
    await startAndCrash(LOW);

    expect((await current()).body).toEqual({
      round: {
        id: LOW.id,
        status: 'CRASHED',
        seedHash: sha256(LOW.seed),
        bettingEndsAt,
        startedAt: bettingEndsAt,
        crashedAt: bettingEndsAt + LOW.timeToCrash,
        crashPoint: LOW.crashPoint,
        serverSeed: LOW.seed,
      },
      bets: [],
      myBet: null,
      serverTime: bettingEndsAt + LOW.timeToCrash,
    });
  });

  it('X12: apostas com betId e nickname, sem playerId (D71); myBet só com Bearer; Bearer inválido dá 401', async () => {
    const guest = async (nickname: string) =>
      (await http().post('/players/guest').send({ nickname }).expect(201))
        .body as GuestResponse;
    const ana = await guest('ana');
    const bia = await guest('bia');
    await open(LOW);

    const orm = await testOrm();
    const round = await new MikroOrmRoundRepository(orm.em.fork()).findById(
      LOW.id,
    );
    const anaBet = '00000000-0000-4000-8000-00000000b001';
    const biaBet = '00000000-0000-4000-8000-00000000b002';
    const bets = new MikroOrmBetRepository(orm.em.fork());
    for (const [id, player, now, cents] of [
      [biaBet, bia.playerId, T0 + 1, 1_500],
      [anaBet, ana.playerId, T0 + 2, 2_000],
    ] as const) {
      await bets.save(
        Bet.place({
          id,
          round: round!,
          playerId: player,
          amount: Money.fromCents(cents),
          now,
        }),
      );
    }

    const anonymous = await current();
    expect(anonymous.body.bets).toEqual([
      {
        betId: biaBet,
        nickname: 'bia',
        amount: 1_500,
        status: 'PENDING',
        cashoutMultiplier: null,
        payout: null,
      },
      {
        betId: anaBet,
        nickname: 'ana',
        amount: 2_000,
        status: 'PENDING',
        cashoutMultiplier: null,
        payout: null,
      },
    ]);
    expect(anonymous.body.myBet).toBeNull();
    // O betId é público (D71); o playerId nunca sai nas apostas da rodada.
    for (const listed of anonymous.body.bets as object[]) {
      expect(listed).not.toHaveProperty('playerId');
    }
    for (const hidden of [ana.playerId, bia.playerId]) {
      expect(anonymous.text).not.toContain(hidden);
    }

    const mine = await current(ana.token);
    expect(mine.body.myBet).toEqual({
      betId: anaBet,
      amount: 2_000,
      status: 'PENDING',
      cashoutMultiplier: null,
      payout: null,
    });
    for (const hidden of [ana.playerId, bia.playerId]) {
      expect(mine.text).not.toContain(hidden);
    }

    const invalid = await http()
      .get('/rounds/current')
      .set('Authorization', 'Bearer token-malformado')
      .expect(401);
    expect(invalid.body).toEqual({
      code: 'UNAUTHORIZED',
      message: expect.any(String),
    });
  });

  it.each([
    ['texto', 'abc'],
    ['número', '123'],
    ['sem hífens', LOW.id.replaceAll('-', '')],
    ['caractere a mais', `${LOW.id}0`],
  ])(
    'X13: verify com id malformado (%s) responde 400 VALIDATION_ERROR, nunca 500',
    async (_case, id) => {
      const response = await http().get(`/rounds/${id}/verify`).expect(400);
      expect(response.body).toEqual({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('id'),
      });
    },
  );

  it('X14: verify responde 404 para id inexistente, 409 para rodada aberta e 200 depois do crash', async () => {
    const missing = await http()
      .get('/rounds/00000000-0000-4000-8000-000000000000/verify')
      .expect(404);
    expect(missing.body.code).toBe('ROUND_NOT_FOUND');

    await open(LOW);
    const early = await http().get(`/rounds/${LOW.id}/verify`).expect(409);
    expect(early.body.code).toBe('SECRET_NOT_REVEALED');
    expect(early.text).not.toContain(LOW.seed);

    await startAndCrash(LOW);
    const verified = await http()
      .get(`/rounds/${LOW.id.toUpperCase()}/verify`)
      .expect(200);
    const body = verified.body as VerifyResponse;
    expect(body).toEqual({
      serverSeed: LOW.seed,
      seedHash: sha256(LOW.seed),
      crashPoint: LOW.crashPoint,
    });
    expect(sha256(body.serverSeed)).toBe(body.seedHash);
  });

  it('X15: history lista as crashadas da mais recente para a mais antiga; limit inválido dá 400', async () => {
    const lowEnds = await open(LOW);
    await startAndCrash(LOW);
    clock.advance(PAUSE_MS);
    const highEnds = await open(HIGH);
    await startAndCrash(HIGH);

    const all = await http().get('/rounds/history').expect(200);
    expect(all.body as RoundHistoryItem[]).toEqual([
      {
        id: HIGH.id,
        crashPoint: HIGH.crashPoint,
        crashedAt: highEnds + HIGH.timeToCrash,
      },
      {
        id: LOW.id,
        crashPoint: LOW.crashPoint,
        crashedAt: lowEnds + LOW.timeToCrash,
      },
    ]);

    const one = await http().get('/rounds/history?limit=1').expect(200);
    expect((one.body as RoundHistoryItem[]).map((item) => item.id)).toEqual([
      HIGH.id,
    ]);

    for (const limit of ['0', 'abc', '101']) {
      const response = await http()
        .get(`/rounds/history?limit=${limit}`)
        .expect(400);
      expect(response.body.code, limit).toBe('VALIDATION_ERROR');
    }
  });
});
