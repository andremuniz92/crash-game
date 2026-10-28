import { multiplierAt } from '@crash/shared';
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
import { type TestOrm, testOrm } from '../../../test/integration/test-orm.js';
import { requestHash } from '../../shared/application/request-hash.js';
import { Money } from '../../shared/domain/money.js';
import { Multiplier } from '../../shared/domain/multiplier.js';
import { MikroOrmUnitOfWork } from '../../shared/infrastructure/database/mikro-orm-unit-of-work.js';
import { FakeClock } from '../../shared/testing/fake-clock.js';
import { CashOut } from './cash-out.js';
import { PlaceBet } from './place-bet.js';

const T0 = Date.parse('2026-10-28T12:00:00.000Z');
const STARTED_AT = T0;
const CRASH_AT = STARTED_AT + HIGH.timeToCrash;
const P1 = 'a3a3a3a3-0000-4000-8000-000000000001';
const P2 = 'a3a3a3a3-0000-4000-8000-000000000002';
const P3 = 'a3a3a3a3-0000-4000-8000-000000000003';
const BET: Record<string, string> = {
  [P1]: 'b3b3b3b3-0000-4000-8000-000000000001',
  [P2]: 'b3b3b3b3-0000-4000-8000-000000000002',
  [P3]: 'b3b3b3b3-0000-4000-8000-000000000003',
};
const K1 = 'c3c3c3c3-0000-4000-8000-000000000001';
const K2 = 'c3c3c3c3-0000-4000-8000-000000000002';
const AMOUNT = 2_500;

let orm: TestOrm;

/** Multiplicador e payout esperados pela fórmula do shared, com o teto do crash point. */
function expected(now: number) {
  const x100 = Math.min(multiplierAt(now - STARTED_AT), HIGH.crashPoint);
  const payout = Money.fromCents(AMOUNT).multiply(Multiplier.fromX100(x100));
  return { multiplier: x100, payout: payout.cents };
}

function cashOutAt(now: number) {
  const clock = new FakeClock(now);
  const events = recordingPublisher();
  return {
    cashOut: new CashOut(new MikroOrmUnitOfWork(orm), clock, events),
    clock,
    events,
  };
}

const request = (playerId: string, betId: string, idempotencyKey = K1) => ({
  playerId,
  betId,
  idempotencyKey,
});

/** Rodada HIGH em BETTING até T0, com uma aposta de AMOUNT de cada jogador. */
beforeEach(async () => {
  orm = await testOrm();
  await saveRound(orm, newRound(HIGH, STARTED_AT));
  for (const player of [P1, P2, P3]) {
    await playerWithWallet(orm, player, T0 - 60_000);
    await new PlaceBet(
      new MikroOrmUnitOfWork(orm),
      new FakeClock(T0 - 1_000),
      { newId: () => BET[player]! },
      recordingPublisher(),
    ).execute({ playerId: player, amount: AMOUNT, idempotencyKey: K1 });
  }
});

async function start(): Promise<void> {
  await changeRound(orm, HIGH.id, (round) => round.start(STARTED_AT));
}

describe('CashOut (seção 10.2)', () => {
  it('CO1: credita amount × multiplicador, grava o extrato e a idempotência, e publica BetCashedOut', async () => {
    await start();
    const now = STARTED_AT + 10_000;
    const { cashOut, clock, events } = cashOutAt(now);
    const reads = vi.spyOn(clock, 'now');
    const { multiplier, payout } = expected(now);

    const result = await cashOut.execute(request(P1, BET[P1]!, K2));

    const body = {
      betId: BET[P1],
      multiplier,
      payout,
      balance: 100_000 - AMOUNT + payout,
    };
    expect(multiplier).toBe(182);
    expect(result).toEqual({ status: 200, body, replayed: false });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(events.published).toEqual([
      {
        type: 'BetCashedOut',
        betId: BET[P1],
        roundId: HIGH.id,
        playerId: P1,
        multiplier: Multiplier.fromX100(multiplier),
        payout: Money.fromCents(payout),
      },
    ]);
    expect(
      await query(
        orm,
        `select status, cashout_multiplier, payout::int from bets where id = ?`,
        [BET[P1]],
      ),
    ).toEqual([
      { status: 'CASHED_OUT', cashout_multiplier: multiplier, payout },
    ]);
    expect(
      await query(
        orm,
        `select amount::int, bet_id from ledger_entries where player_id = ? and type = 'CASHOUT'`,
        [P1],
      ),
    ).toEqual([{ amount: payout, bet_id: BET[P1] }]);
    expect(
      await query(
        orm,
        `select endpoint, request_hash, response_status, response_body
           from idempotency_keys where player_id = ? and key = ?`,
        [P1, K2],
      ),
    ).toEqual([
      {
        endpoint: `POST /bets/${BET[P1]}/cashout`,
        request_hash: requestHash({}),
        response_status: 200,
        response_body: body,
      },
    ]);
  });

  it('CO2: 1 ms antes de crashAt é aceito; em crashAt e 1 ms depois, TOO_LATE, com a rodada ainda RUNNING (seção 12, D8)', async () => {
    await start();

    const accepted = await cashOutAt(CRASH_AT - 1).cashOut.execute(
      request(P1, BET[P1]!, K2),
    );
    expect(accepted.body.multiplier).toBe(expected(CRASH_AT - 1).multiplier);

    for (const [player, now] of [
      [P2, CRASH_AT],
      [P3, CRASH_AT + 1],
    ] as const) {
      await expect(
        cashOutAt(now).cashOut.execute(request(player, BET[player]!, K2)),
      ).rejects.toMatchObject({ code: 'TOO_LATE' });
    }
    expect(await count(orm, 'bets', `status = 'PENDING'`)).toBe(2);
  });

  it('CO3: rodada em BETTING responde ROUND_NOT_RUNNING; rodada já crashada, TOO_LATE (D34)', async () => {
    await expect(
      cashOutAt(T0 - 500).cashOut.execute(request(P1, BET[P1]!, K2)),
    ).rejects.toMatchObject({ code: 'ROUND_NOT_RUNNING' });

    await start();
    await changeRound(orm, HIGH.id, (round) => round.crash(CRASH_AT));
    await expect(
      cashOutAt(CRASH_AT - 1).cashOut.execute(request(P1, BET[P1]!, K2)),
    ).rejects.toMatchObject({ code: 'TOO_LATE' });
  });

  it('CO4: aposta de outro jogador ou inexistente responde BET_NOT_FOUND (D33)', async () => {
    await start();
    const { cashOut } = cashOutAt(STARTED_AT + 1_000);

    await expect(
      cashOut.execute(request(P2, BET[P1]!, K2)),
    ).rejects.toMatchObject({ code: 'BET_NOT_FOUND' });
    await expect(
      cashOut.execute(request(P1, 'b3b3b3b3-0000-4000-8000-0000000000ff', K2)),
    ).rejects.toMatchObject({ code: 'BET_NOT_FOUND' });
    expect(await count(orm, 'bets', `status = 'PENDING'`)).toBe(3);
  });

  it('CO5: segundo cash out com outra chave dá BET_NOT_PENDING; replay devolve a mesma resposta sem novo crédito', async () => {
    await start();
    const { cashOut } = cashOutAt(STARTED_AT + 10_000);

    const first = await cashOut.execute(request(P1, BET[P1]!, K2));
    const replay = await cashOut.execute(request(P1, BET[P1]!, K2));
    expect(replay).toEqual({ ...first, replayed: true });

    await expect(
      cashOut.execute(
        request(P1, BET[P1]!, 'c3c3c3c3-0000-4000-8000-000000000009'),
      ),
    ).rejects.toMatchObject({ code: 'BET_NOT_PENDING' });
    expect(
      await count(orm, 'ledger_entries', `player_id = ? and type = 'CASHOUT'`, [
        P1,
      ]),
    ).toBe(1);
  });

  it('CO6: depois de aposta e cash out, o saldo é a soma do extrato (seção 6.4)', async () => {
    await start();
    await cashOutAt(STARTED_AT + 10_000).cashOut.execute(
      request(P1, BET[P1]!, K2),
    );

    for (const player of [P1, P2, P3]) {
      const state = await walletState(orm, player);
      expect(state.ledgerSum, player).toBe(state.balance);
    }
    expect((await walletState(orm, P1)).balance).toBe(
      100_000 - AMOUNT + expected(STARTED_AT + 10_000).payout,
    );
  });

  it('CO7: replay de um cash out feito antes do crash devolve a resposta original (200), não TOO_LATE', async () => {
    await start();
    const original = await cashOutAt(STARTED_AT + 10_000).cashOut.execute(
      request(P1, BET[P1]!, K2),
    );
    await changeRound(orm, HIGH.id, (round) => round.crash(CRASH_AT));

    const replay = await cashOutAt(CRASH_AT + 5_000).cashOut.execute(
      request(P1, BET[P1]!, K2),
    );

    expect(replay).toEqual({
      status: 200,
      body: original.body,
      replayed: true,
    });
  });
});
