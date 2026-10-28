import {
  changeRound,
  count,
  HIGH,
  newRound,
  playerWithWallet,
  query,
  recordingPublisher,
  saveRound,
  walletState,
} from '../../../test/integration/betting.js';
import { insertBetsFor } from '../../../test/integration/fixtures.js';
import { type TestOrm, testOrm } from '../../../test/integration/test-orm.js';
import { requestHash } from '../../shared/application/request-hash.js';
import { Money } from '../../shared/domain/money.js';
import { MikroOrmUnitOfWork } from '../../shared/infrastructure/database/mikro-orm-unit-of-work.js';
import { MikroOrmIdempotencyStore } from '../../shared/infrastructure/idempotency/mikro-orm-idempotency-store.js';
import { FakeClock } from '../../shared/testing/fake-clock.js';
import { MikroOrmWalletRepository } from '../../wallet/infrastructure/mikro-orm-wallet.repository.js';
import { PlaceBet } from './place-bet.js';

const T0 = Date.parse('2026-10-28T12:00:00.000Z');
const BETTING_ENDS_AT = T0 + 10_000;
const P1 = 'a2a2a2a2-0000-4000-8000-000000000001';
const P2 = 'a2a2a2a2-0000-4000-8000-000000000002';
const K1 = 'c2c2c2c2-0000-4000-8000-000000000001';
const K2 = 'c2c2c2c2-0000-4000-8000-000000000002';
const BET_IDS = [
  'b2b2b2b2-0000-4000-8000-000000000001',
  'b2b2b2b2-0000-4000-8000-000000000002',
  'b2b2b2b2-0000-4000-8000-000000000003',
];

let orm: TestOrm;

/** PlaceBet com relógio falso, ids fixos em ordem e eventos gravados. */
function setup(now = T0) {
  const clock = new FakeClock(now);
  const events = recordingPublisher();
  const ids = [...BET_IDS];
  const placeBet = new PlaceBet(
    new MikroOrmUnitOfWork(orm),
    clock,
    { newId: () => ids.shift()! },
    events,
  );
  return { placeBet, clock, events };
}

const bet = (playerId: string, amount: number, idempotencyKey = K1) => ({
  playerId,
  amount,
  idempotencyKey,
});

async function openRound(): Promise<void> {
  await saveRound(orm, newRound(HIGH, BETTING_ENDS_AT));
}

beforeEach(async () => {
  orm = await testOrm();
  await playerWithWallet(orm, P1, T0 - 60_000);
  await playerWithWallet(orm, P2, T0 - 60_000);
});

describe('PlaceBet (seção 10.1)', () => {
  it('PB1: aposta, debita, grava o extrato e a idempotência; publica depois do commit; lê o relógio uma vez', async () => {
    await openRound();
    const { clock, events } = setup();
    const now = vi.spyOn(clock, 'now');
    const order: string[] = [];
    const real = new MikroOrmUnitOfWork(orm);
    const tracked = new PlaceBet(
      {
        run: async (work) => {
          const result = await real.run(work);
          order.push('commit');
          return result;
        },
      },
      clock,
      { newId: () => BET_IDS[0]! },
      {
        publish: (published) => {
          order.push('publish');
          events.publish(published);
        },
      },
    );

    const result = await tracked.execute(bet(P1, 2_500));

    const body = {
      betId: BET_IDS[0],
      roundId: HIGH.id,
      amount: 2_500,
      balance: 97_500,
    };
    expect(result).toEqual({ status: 201, body, replayed: false });
    expect(now).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['commit', 'publish']);
    expect(events.published).toEqual([
      {
        type: 'BetPlaced',
        betId: BET_IDS[0],
        roundId: HIGH.id,
        playerId: P1,
        amount: Money.fromCents(2_500),
      },
    ]);

    expect(
      await query(orm, `select status, amount::int from bets where id = ?`, [
        BET_IDS[0],
      ]),
    ).toEqual([{ status: 'PENDING', amount: 2_500 }]);
    expect(await walletState(orm, P1)).toEqual({
      balance: 97_500,
      version: 2,
      ledgerSum: 97_500,
    });
    expect(
      await query(
        orm,
        `select type, amount::int, bet_id from ledger_entries
          where player_id = ? and type = 'BET_PLACED'`,
        [P1],
      ),
    ).toEqual([{ type: 'BET_PLACED', amount: -2_500, bet_id: BET_IDS[0] }]);
    expect(
      await query(
        orm,
        `select endpoint, request_hash, response_status, response_body
           from idempotency_keys where player_id = ? and key = ?`,
        [P1, K1],
      ),
    ).toEqual([
      {
        endpoint: 'POST /bets',
        request_hash: requestHash({ amount: 2_500 }),
        response_status: 201,
        response_body: body,
      },
    ]);
  });

  it('PB2: sem rodada aberta, com a rodada em RUNNING ou com BETTING vencida, responde ROUND_NOT_ACCEPTING_BETS sem gravar nada', async () => {
    const attempt = async (now: number) =>
      setup(now).placeBet.execute(bet(P1, 1_000));

    await expect(attempt(T0)).rejects.toMatchObject({
      code: 'ROUND_NOT_ACCEPTING_BETS',
    });

    await openRound();
    await expect(attempt(BETTING_ENDS_AT)).rejects.toMatchObject({
      code: 'ROUND_NOT_ACCEPTING_BETS',
    });

    await changeRound(orm, HIGH.id, (round) => round.start(BETTING_ENDS_AT));
    await expect(attempt(BETTING_ENDS_AT + 1)).rejects.toMatchObject({
      code: 'ROUND_NOT_ACCEPTING_BETS',
    });

    expect(await count(orm, 'bets')).toBe(0);
    expect(await count(orm, 'idempotency_keys')).toBe(0);
    expect((await walletState(orm, P1)).balance).toBe(100_000);
  });

  it.each([50, 100_001, 0, -100, 10.5])(
    'PB3: valor %d responde INVALID_BET_AMOUNT sem gravar nada',
    async (amount) => {
      await openRound();
      await expect(
        setup().placeBet.execute(bet(P1, amount)),
      ).rejects.toMatchObject({ code: 'INVALID_BET_AMOUNT' });
      expect(await count(orm, 'bets')).toBe(0);
      expect((await walletState(orm, P1)).balance).toBe(100_000);
    },
  );

  it('PB4: saldo insuficiente desfaz tudo: sem aposta, sem lançamento e sem idempotência', async () => {
    // Deixa P1 com 500 centavos, com o extrato consistente.
    const [earlier] = await insertBetsFor(orm, P1, 1);
    await orm.em.fork().transactional(async (em) => {
      const wallets = new MikroOrmWalletRepository(em);
      const wallet = await wallets.getForUpdate(P1);
      wallet.debit(Money.fromCents(99_500), { betId: earlier!, now: T0 - 1 });
      await wallets.save(wallet);
    });
    await openRound();

    await expect(
      setup().placeBet.execute(bet(P1, 1_000)),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });

    expect(await count(orm, 'bets', 'round_id = ?', [HIGH.id])).toBe(0);
    expect(await count(orm, 'idempotency_keys')).toBe(0);
    expect(await walletState(orm, P1)).toEqual({
      balance: 500,
      version: 2,
      ledgerSum: 500,
    });
  });

  it('PB5: segunda aposta na mesma rodada com outra chave responde BET_ALREADY_PLACED', async () => {
    await openRound();
    const { placeBet } = setup();

    await placeBet.execute(bet(P1, 1_000, K1));
    await expect(placeBet.execute(bet(P1, 2_000, K2))).rejects.toMatchObject({
      code: 'BET_ALREADY_PLACED',
    });

    expect((await walletState(orm, P1)).balance).toBe(99_000);
  });

  it('PB6: replay com a mesma chave e o mesmo corpo devolve a mesma resposta, sem novo débito nem novo evento', async () => {
    await openRound();
    const { placeBet, events } = setup();

    const first = await placeBet.execute(bet(P1, 1_000));
    const replay = await placeBet.execute(bet(P1, 1_000));

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await count(orm, 'bets')).toBe(1);
    expect(await walletState(orm, P1)).toEqual({
      balance: 99_000,
      version: 2,
      ledgerSum: 99_000,
    });
    expect(events.published).toHaveLength(1);
  });

  it('PB7: a mesma chave com outro corpo ou já usada em outro endpoint responde IDEMPOTENCY_KEY_REUSED', async () => {
    await openRound();
    const { placeBet } = setup();
    await placeBet.execute(bet(P1, 1_000, K1));

    await expect(placeBet.execute(bet(P1, 2_000, K1))).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });

    await orm.em.fork().transactional((em) =>
      new MikroOrmIdempotencyStore(em).save({
        playerId: P2,
        key: K2,
        endpoint: `POST /bets/${BET_IDS[2]}/cashout`,
        requestHash: requestHash({}),
        responseStatus: 200,
        responseBody: {},
        createdAt: T0,
      }),
    );
    await expect(placeBet.execute(bet(P2, 1_000, K2))).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });

    expect(await count(orm, 'bets')).toBe(1);
  });

  it('PB8: erro não é salvo; a mesma chave dá certo numa nova tentativa', async () => {
    const { placeBet } = setup();
    await expect(placeBet.execute(bet(P1, 1_000))).rejects.toMatchObject({
      code: 'ROUND_NOT_ACCEPTING_BETS',
    });

    await openRound();
    const retry = await placeBet.execute(bet(P1, 1_000));

    expect(retry.status).toBe(201);
    expect(retry.replayed).toBe(false);
    expect((await walletState(orm, P1)).balance).toBe(99_000);
  });

  it('PB9: a mesma chave usada por outro jogador é uma operação independente', async () => {
    await openRound();
    const { placeBet } = setup();

    const first = await placeBet.execute(bet(P1, 1_000, K1));
    const second = await placeBet.execute(bet(P2, 3_000, K1));

    expect(second).toEqual({
      status: 201,
      replayed: false,
      body: {
        betId: BET_IDS[1],
        roundId: HIGH.id,
        amount: 3_000,
        balance: 97_000,
      },
    });
    expect(second.body.betId).not.toBe(first.body.betId);
    expect((await walletState(orm, P1)).balance).toBe(99_000);
    expect((await walletState(orm, P2)).balance).toBe(97_000);
    expect(await count(orm, 'idempotency_keys', 'key = ?', [K1])).toBe(2);
  });
});
