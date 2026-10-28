import { multiplierAt } from '@crash/shared';
import type {
  CashOutResponse,
  CurrentRoundResponse,
  GuestResponse,
  PlaceBetResponse,
  WalletResponse,
} from '@crash/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { GameLoopStep } from '../../src/rounds/application/game-loop-step.js';
import type { PublishedEvent } from '../../src/shared/application/event-publisher.js';
import { Money } from '../../src/shared/domain/money.js';
import { Multiplier } from '../../src/shared/domain/multiplier.js';
import type { InMemoryEventPublisher } from '../../src/shared/infrastructure/in-memory-event-publisher.js';
import { EVENT_PUBLISHER } from '../../src/shared/infrastructure/tokens.js';
import { FakeClock } from '../../src/shared/testing/fake-clock.js';
import { count, LOW, walletState } from '../integration/betting.js';
import { deferred, waitForBlockedLock } from '../integration/fixtures.js';
import { type TestOrm, testOrm } from '../integration/test-orm.js';
import { BETTING_MS, createTestApp, QueuedGenerators } from './test-app.js';

const T0 = Date.parse('2026-10-28T12:00:00.000Z');
const STARTED_AT = T0 + BETTING_MS;
const CRASH_AT = STARTED_AT + LOW.timeToCrash;
const key = (n: number) =>
  `c6c6c6c6-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Multiplicador e payout esperados pela fórmula do shared, com o teto do crash point. */
function expected(amount: number, now: number) {
  const x100 = Math.min(multiplierAt(now - STARTED_AT), LOW.crashPoint);
  const payout = Money.fromCents(amount).multiply(Multiplier.fromX100(x100));
  return { multiplier: x100, payout: payout.cents };
}

describe('apostas e cash out (E2E, seções 10.1 e 10.2)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;
  let generators: QueuedGenerators;
  let step: GameLoopStep;
  let orm: TestOrm;

  beforeEach(async () => {
    clock = new FakeClock(T0);
    generators = new QueuedGenerators();
    app = await createTestApp({ clock, generators });
    step = app.get(GameLoopStep);
    orm = await testOrm();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function guest(nickname: string): Promise<GuestResponse> {
    const response = await http()
      .post('/players/guest')
      .send({ nickname })
      .expect(201);
    return response.body as GuestResponse;
  }

  /** Abre a rodada LOW (apostas até STARTED_AT). */
  async function openRound(): Promise<void> {
    generators.enqueueRound(LOW);
    await step.execute();
  }

  async function startRound(): Promise<void> {
    clock.advance(STARTED_AT - clock.now());
    await step.execute();
  }

  function placeBet(
    token: string | null,
    body: unknown,
    idempotencyKey: string | null,
  ) {
    const call = http().post('/bets');
    if (token) call.set('Authorization', `Bearer ${token}`);
    if (idempotencyKey) call.set('Idempotency-Key', idempotencyKey);
    return call.send(body as object);
  }

  function cashOut(
    token: string | null,
    betId: string,
    idempotencyKey: string | null,
  ) {
    const call = http().post(`/bets/${betId}/cashout`);
    if (token) call.set('Authorization', `Bearer ${token}`);
    if (idempotencyKey) call.set('Idempotency-Key', idempotencyKey);
    return call.send();
  }

  it('X16: POST /bets responde 201; a carteira e o current refletem a aposta', async () => {
    const ana = await guest('ana');
    await openRound();

    const response = await placeBet(
      ana.token,
      { amount: 2_500 },
      key(1),
    ).expect(201);

    const body = response.body as PlaceBetResponse;
    expect(body).toEqual({
      betId: expect.any(String),
      roundId: LOW.id,
      amount: 2_500,
      balance: 97_500,
    });
    const wallet = (
      await http()
        .get('/wallet')
        .set('Authorization', `Bearer ${ana.token}`)
        .expect(200)
    ).body as WalletResponse;
    expect(wallet.balance).toBe(97_500);
    expect(wallet.entries[0]).toEqual({
      type: 'BET_PLACED',
      amount: -2_500,
      betId: body.betId,
      createdAt: T0,
    });
    const current = (
      await http()
        .get('/rounds/current')
        .set('Authorization', `Bearer ${ana.token}`)
        .expect(200)
    ).body as CurrentRoundResponse;
    expect(current.myBet?.betId).toBe(body.betId);
  });

  it('X17: erros do POST /bets, sem debitar nada', async () => {
    const ana = await guest('ana');
    const expectError = async (
      pending: PromiseLike<request.Response>,
      status: number,
      code: string,
    ) => {
      const response = await pending;
      expect({ status: response.status, code: response.body.code }).toEqual({
        status,
        code,
      });
    };

    await expectError(
      placeBet(null, { amount: 1_000 }, null),
      401,
      'UNAUTHORIZED',
    );
    await expectError(
      placeBet(ana.token, { amount: 1_000 }, null),
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    );
    await expectError(
      placeBet(ana.token, { amount: 1_000 }, 'abc'),
      400,
      'INVALID_IDEMPOTENCY_KEY',
    );
    await expectError(
      placeBet(ana.token, { amount: 1_000 }, key(1)),
      409,
      'ROUND_NOT_ACCEPTING_BETS',
    );

    await openRound();
    for (const body of [{ amount: '1000' }, {}, { amount: 10.5 }]) {
      await expectError(
        placeBet(ana.token, body, key(2)),
        400,
        'VALIDATION_ERROR',
      );
    }
    for (const amount of [50, -100]) {
      await expectError(
        placeBet(ana.token, { amount }, key(3)),
        400,
        'INVALID_BET_AMOUNT',
      );
    }
    expect((await walletState(orm, ana.playerId)).balance).toBe(100_000);

    await placeBet(ana.token, { amount: 1_000 }, key(4)).expect(201);
    await expectError(
      placeBet(ana.token, { amount: 2_000 }, key(5)),
      409,
      'BET_ALREADY_PLACED',
    );
    await expectError(
      placeBet(ana.token, { amount: 2_000 }, key(4)),
      422,
      'IDEMPOTENCY_KEY_REUSED',
    );
    expect((await walletState(orm, ana.playerId)).balance).toBe(99_000);
  });

  it.each([
    ['texto', 'abc'],
    ['número', '123'],
    ['sem hífens', LOW.id.replaceAll('-', '')],
    ['caractere a mais', `${LOW.id}0`],
  ])(
    'X18: cash out com id malformado (%s) responde 400 VALIDATION_ERROR, nunca 500, mesmo sem a chave',
    async (_case, betId) => {
      const ana = await guest('ana');
      for (const idempotencyKey of [key(1), null]) {
        const response = await cashOut(ana.token, betId, idempotencyKey).expect(
          400,
        );
        expect(response.body).toEqual({
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('id'),
        });
      }
    },
  );

  it('X19: erros do cash out', async () => {
    const ana = await guest('ana');
    const bia = await guest('bia');
    await openRound();
    const { betId } = (
      await placeBet(ana.token, { amount: 1_000 }, key(1)).expect(201)
    ).body as PlaceBetResponse;
    const missing = 'b6b6b6b6-0000-4000-8000-000000000000';

    expect((await cashOut(null, betId, key(2)).expect(401)).body.code).toBe(
      'UNAUTHORIZED',
    );
    expect((await cashOut(ana.token, betId, null).expect(400)).body.code).toBe(
      'IDEMPOTENCY_KEY_REQUIRED',
    );
    expect(
      (await cashOut(bia.token, betId, key(2)).expect(404)).body.code,
    ).toBe('BET_NOT_FOUND');
    expect(
      (await cashOut(ana.token, missing, key(3)).expect(404)).body.code,
    ).toBe('BET_NOT_FOUND');
    expect(
      (await cashOut(ana.token, betId, key(4)).expect(409)).body.code,
    ).toBe('ROUND_NOT_RUNNING');

    await startRound();
    await cashOut(ana.token, betId, key(5)).expect(200);
    expect(
      (await cashOut(ana.token, betId, key(6)).expect(409)).body.code,
    ).toBe('BET_NOT_PENDING');
  });

  it('X20: fluxo completo: aposta, start, cash out, replay e crash', async () => {
    const ana = await guest('ana');
    await openRound();
    const { betId } = (
      await placeBet(ana.token, { amount: 1_000 }, key(1)).expect(201)
    ).body as PlaceBetResponse;
    await startRound();
    clock.advance(2_000);
    const { multiplier, payout } = expected(1_000, clock.now());

    const first = await cashOut(ana.token, betId, key(2)).expect(200);
    const balance = 100_000 - 1_000 + payout;
    expect(first.body as CashOutResponse).toEqual({
      betId,
      multiplier,
      payout,
      balance,
    });
    const replay = await cashOut(ana.token, betId, key(2)).expect(200);
    expect(replay.body).toEqual(first.body);

    const wallet = (
      await http()
        .get('/wallet')
        .set('Authorization', `Bearer ${ana.token}`)
        .expect(200)
    ).body as WalletResponse;
    expect(wallet.balance).toBe(balance);
    expect(wallet.entries.map((entry) => entry.type)).toEqual([
      'CASHOUT',
      'BET_PLACED',
      'INITIAL_GRANT',
    ]);

    clock.advance(CRASH_AT - clock.now());
    await step.execute();
    const current = (await http().get('/rounds/current').expect(200))
      .body as CurrentRoundResponse;
    expect(current.round?.status).toBe('CRASHED');
    expect(current.bets).toEqual([
      {
        betId,
        nickname: 'ana',
        amount: 1_000,
        status: 'CASHED_OUT',
        cashoutMultiplier: multiplier,
        payout,
      },
    ]);
  });

  it('X21: BetPlaced e BetCashedOut chegam ao EventPublisher da app, uma vez; replay não publica', async () => {
    const published: PublishedEvent[] = [];
    app
      .get<InMemoryEventPublisher>(EVENT_PUBLISHER)
      .subscribe((event) => published.push(event));
    const ana = await guest('ana');
    await openRound();
    const { betId } = (
      await placeBet(ana.token, { amount: 1_000 }, key(1)).expect(201)
    ).body as PlaceBetResponse;
    await placeBet(ana.token, { amount: 1_000 }, key(1)).expect(201);
    await startRound();
    clock.advance(1_000);
    await cashOut(ana.token, betId, key(2)).expect(200);
    await cashOut(ana.token, betId, key(2)).expect(200);

    const bets = published.filter((event) => event.type.startsWith('Bet'));
    expect(bets).toEqual([
      expect.objectContaining({ type: 'BetPlaced', betId }),
      expect.objectContaining({ type: 'BetCashedOut', betId }),
    ]);
  });

  describe('concorrência pela API (seção 12, D54)', () => {
    /** Segura um lock numa transação do teste até `release`. */
    async function hold(sql: string, params: unknown[]) {
      const held = deferred();
      const release = deferred();
      const holder = orm.em.fork().transactional(async (em) => {
        await em
          .getConnection()
          .execute(sql, params, 'all', em.getTransactionContext());
        held.resolve();
        await release.promise;
      });
      await held.promise;
      return { release: () => release.resolve(), holder };
    }

    it('K1: duas requisições simultâneas com a mesma chave fazem um débito só, e as duas recebem a mesma resposta', async () => {
      const ana = await guest('ana');
      await openRound();
      // O mesmo advisory lock que o MikroOrmIdempotencyStore usa (D60).
      const lock = await hold(
        'select pg_advisory_xact_lock(hashtextextended(?, 0))',
        [`${ana.playerId}:${key(1)}`],
      );

      let responses: request.Response[];
      try {
        const both = [1, 2].map(() =>
          placeBet(ana.token, { amount: 1_000 }, key(1)).then((r) => r),
        );
        await waitForBlockedLock(orm, { count: 2 });
        lock.release();
        responses = await Promise.all(both);
      } finally {
        lock.release();
        await lock.holder;
      }

      expect(responses.map((r) => r.status)).toEqual([201, 201]);
      expect(responses[1]!.body).toEqual(responses[0]!.body);
      expect(await count(orm, 'bets')).toBe(1);
      expect(await count(orm, 'ledger_entries', `type = 'BET_PLACED'`)).toBe(1);
      expect(await count(orm, 'idempotency_keys')).toBe(1);
      expect(await walletState(orm, ana.playerId)).toEqual({
        balance: 99_000,
        version: 2,
        ledgerSum: 99_000,
      });
    });

    it('K2: duas apostas simultâneas com chaves diferentes: uma é aceita e a outra recebe 409 BET_ALREADY_PLACED', async () => {
      const ana = await guest('ana');
      await openRound();
      const lock = await hold(
        'select 1 from wallets where player_id = ? for update',
        [ana.playerId],
      );

      let responses: request.Response[];
      try {
        const both = [key(1), key(2)].map((k) =>
          placeBet(ana.token, { amount: 1_000 }, k).then((r) => r),
        );
        // Uma espera a carteira; a outra espera o índice único da primeira.
        await waitForBlockedLock(orm, { count: 2 });
        lock.release();
        responses = await Promise.all(both);
      } finally {
        lock.release();
        await lock.holder;
      }

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const rejected = responses.find((r) => r.status === 409)!;
      expect(rejected.body.code).toBe('BET_ALREADY_PLACED');
      expect(await count(orm, 'bets')).toBe(1);
      expect((await walletState(orm, ana.playerId)).balance).toBe(99_000);
    });

    it('K3: cash out 1 ms antes de crashAt é aceito; em crashAt e 1 ms depois, TOO_LATE', async () => {
      const players = [
        await guest('ana'),
        await guest('bia'),
        await guest('caio'),
      ];
      await openRound();
      const betIds: string[] = [];
      for (const [i, player] of players.entries()) {
        const { body } = await placeBet(
          player.token,
          { amount: 1_000 },
          key(10 + i),
        ).expect(201);
        betIds.push((body as PlaceBetResponse).betId);
      }
      await startRound();

      clock.advance(CRASH_AT - 1 - clock.now());
      const accepted = await cashOut(
        players[0]!.token,
        betIds[0]!,
        key(20),
      ).expect(200);
      expect((accepted.body as CashOutResponse).multiplier).toBe(
        expected(1_000, CRASH_AT - 1).multiplier,
      );

      for (const i of [1, 2]) {
        clock.advance(1);
        const late = await cashOut(
          players[i]!.token,
          betIds[i]!,
          key(20 + i),
        ).expect(409);
        expect(late.body.code).toBe('TOO_LATE');
      }
      const current = (await http().get('/rounds/current').expect(200))
        .body as CurrentRoundResponse;
      expect(current.round?.status).toBe('RUNNING');
    });
  });
});
