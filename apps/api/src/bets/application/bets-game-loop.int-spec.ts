import {
  changeRound,
  LOW,
  newRound,
  playerWithWallet,
  query,
  recordingPublisher,
  saveRound,
  walletState,
} from '../../../test/integration/betting.js';
import {
  deferred,
  waitForBlockedLock,
} from '../../../test/integration/fixtures.js';
import { type TestOrm, testOrm } from '../../../test/integration/test-orm.js';
import { GameLoopStep } from '../../rounds/application/game-loop-step.js';
import { ServerSeed } from '../../rounds/domain/server-seed.js';
import { MikroOrmUnitOfWork } from '../../shared/infrastructure/database/mikro-orm-unit-of-work.js';
import { FakeClock } from '../../shared/testing/fake-clock.js';
import { MikroOrmWalletRepository } from '../../wallet/infrastructure/mikro-orm-wallet.repository.js';
import { CashOut } from './cash-out.js';
import { PlaceBet } from './place-bet.js';

/*
 * Casos de uso reais disputando a rodada com o passo real do game loop
 * (D57, D54). O teste segura a carteira do jogador para parar o caso de uso
 * depois de ele já ter a rodada em FOR SHARE.
 */

const T0 = Date.parse('2026-10-28T12:00:00.000Z');
const CRASH_AT = T0 + LOW.timeToCrash;
const P1 = 'a4a4a4a4-0000-4000-8000-000000000001';
const BET = 'b4b4b4b4-0000-4000-8000-000000000001';
const K1 = 'c4c4c4c4-0000-4000-8000-000000000001';
const K2 = 'c4c4c4c4-0000-4000-8000-000000000002';

let orm: TestOrm;

function stepAt(now: number) {
  const events = recordingPublisher();
  const step = new GameLoopStep(
    new MikroOrmUnitOfWork(orm),
    new FakeClock(now),
    { newId: () => 'a4a4a4a4-0000-4000-8000-0000000000ff' },
    { newSeed: () => ServerSeed.fromHex(LOW.seed) },
    events,
    { bettingMs: 10_000, pauseMs: 3_000 },
  );
  return { step, events };
}

function placeBetAt(now: number) {
  return new PlaceBet(
    new MikroOrmUnitOfWork(orm),
    new FakeClock(now),
    { newId: () => BET },
    recordingPublisher(),
  );
}

/**
 * Segura a carteira de P1 até `release`, roda `work` (que deve parar nela),
 * depois `rival` (que deve parar na rodada), e solta. Devolve a ordem em que
 * os dois terminaram.
 */
async function race(
  work: () => Promise<unknown>,
  rival: () => Promise<unknown>,
): Promise<string[]> {
  const held = deferred();
  const release = deferred();
  const order: string[] = [];
  const holder = orm.em.fork().transactional(async (em) => {
    await new MikroOrmWalletRepository(em).getForUpdate(P1);
    held.resolve();
    await release.promise;
  });
  await held.promise;

  let first: Promise<unknown> | undefined;
  let second: Promise<unknown> | undefined;
  try {
    first = work().then(() => order.push('caso de uso'));
    await waitForBlockedLock(orm, { count: 1 });
    second = rival().then(() => order.push('game loop'));
    await waitForBlockedLock(orm, { count: 2 });
    order.push('ambos esperando');
  } finally {
    release.resolve();
    await Promise.allSettled([holder, first, second]);
  }
  await Promise.all([holder, first, second]);
  return order;
}

beforeEach(async () => {
  orm = await testOrm();
  await playerWithWallet(orm, P1, T0 - 60_000);
});

describe('apostas × game loop (D57)', () => {
  it('CC1: o crash espera o cash out real em andamento; a aposta fica CASHED_OUT e o crédito entra', async () => {
    await saveRound(orm, newRound(LOW, T0));
    await placeBetAt(T0 - 1).execute({
      playerId: P1,
      amount: 1_000,
      idempotencyKey: K1,
    });
    await changeRound(orm, LOW.id, (round) => round.start(T0));
    const cashOut = new CashOut(
      new MikroOrmUnitOfWork(orm),
      new FakeClock(T0 + 1_000),
      recordingPublisher(),
    );
    const { step, events } = stepAt(CRASH_AT + 10);

    const order = await race(
      () => cashOut.execute({ playerId: P1, betId: BET, idempotencyKey: K2 }),
      () => step.execute(),
    );

    expect(order).toEqual(['ambos esperando', 'caso de uso', 'game loop']);
    expect(
      await query(orm, `select status from bets where id = ?`, [BET]),
    ).toEqual([{ status: 'CASHED_OUT' }]);
    expect(events.published).toContainEqual({
      type: 'BetsSettled',
      roundId: LOW.id,
      lostBetIds: [],
    });
    const wallet = await walletState(orm, P1);
    expect(wallet.balance).toBeGreaterThan(99_000);
    expect(wallet.ledgerSum).toBe(wallet.balance);
  });

  it('CB1: o start espera a aposta real em andamento; a aposta entra antes de a rodada começar', async () => {
    await saveRound(orm, newRound(LOW, T0));
    const { step } = stepAt(T0 + 1);

    const order = await race(
      () =>
        placeBetAt(T0 - 1).execute({
          playerId: P1,
          amount: 1_000,
          idempotencyKey: K1,
        }),
      () => step.execute(),
    );

    expect(order).toEqual(['ambos esperando', 'caso de uso', 'game loop']);
    expect(
      await query(
        orm,
        `select b.status, r.status as round_status
           from bets b join rounds r on r.id = b.round_id where b.id = ?`,
        [BET],
      ),
    ).toEqual([{ status: 'PENDING', round_status: 'RUNNING' }]);
    expect((await walletState(orm, P1)).balance).toBe(99_000);
  });

  it('CB2: o start espera também a aposta parada entre a leitura da rodada e a gravação (só o FOR SHARE cobre essa janela)', async () => {
    await saveRound(orm, newRound(LOW, T0));
    const { step } = stepAt(T0 + 1);
    const paused = deferred();
    const resume = deferred();
    const real = new MikroOrmUnitOfWork(orm);
    // Para a aposta logo depois de ler a rodada, antes de gravar: o FK da
    // aposta ainda não travou a rodada, então só o FOR SHARE segura o start.
    const placeBet = new PlaceBet(
      {
        run: (work) =>
          real.run((tx) =>
            work({
              ...tx,
              bets: new Proxy(tx.bets, {
                get(target, prop) {
                  if (prop === 'findByRoundAndPlayer') {
                    return async (roundId: string, playerId: string) => {
                      const found = await target.findByRoundAndPlayer(
                        roundId,
                        playerId,
                      );
                      paused.resolve();
                      await resume.promise;
                      return found;
                    };
                  }
                  const value: unknown = Reflect.get(target, prop);
                  return typeof value === 'function'
                    ? value.bind(target)
                    : value;
                },
              }),
            }),
          ),
      },
      new FakeClock(T0 - 1),
      { newId: () => BET },
      recordingPublisher(),
    );
    const order: string[] = [];

    const placing = placeBet
      .execute({ playerId: P1, amount: 1_000, idempotencyKey: K1 })
      .then(() => order.push('aposta'));
    await paused.promise;
    let starting: Promise<unknown> | undefined;
    try {
      starting = step.execute().then(() => order.push('start'));
      await waitForBlockedLock(orm);
      order.push('start esperando');
    } finally {
      resume.resolve();
      await Promise.allSettled([placing, starting]);
    }
    await Promise.all([placing, starting]);

    expect(order).toEqual(['start esperando', 'aposta', 'start']);
    expect(
      await query(
        orm,
        `select b.created_at < r.started_at as placed_before_start
           from bets b join rounds r on r.id = b.round_id where b.id = ?`,
        [BET],
      ),
    ).toEqual([{ placed_before_start: true }]);
  });
});
