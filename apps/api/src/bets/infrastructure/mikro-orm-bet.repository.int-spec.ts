import { ValidationError } from '@mikro-orm/core';
import {
  deferred,
  insertPlayer,
  waitForBlockedLock,
} from '../../../test/integration/fixtures.js';
import { testOrm } from '../../../test/integration/test-orm.js';
import { Round } from '../../rounds/domain/round.js';
import { ServerSeed } from '../../rounds/domain/server-seed.js';
import { MikroOrmRoundRepository } from '../../rounds/infrastructure/mikro-orm-round.repository.js';
import { Money } from '../../shared/domain/money.js';
import { Bet } from '../domain/bet.js';
import { BetAlreadyPlacedError } from '../domain/bet-repository.js';
import { MikroOrmBetRepository } from './mikro-orm-bet.repository.js';

/* Vetor do M1: 15,85x; 30 s de rodada dão 6,04x. */
const SEED = 'dabbdcfa82ee4f2e349ef253955ca74a8cdc6abde9f63f87840a9659bf665921';
const ROUND_ID = '11111111-2222-4333-8444-000000000004';
const BETTING_ENDS_AT = 1_700_000_010_000;
const P1 = 'c1c1c1c1-0000-4000-8000-000000000001';
const P2 = 'c1c1c1c1-0000-4000-8000-000000000002';
const P3 = 'c1c1c1c1-0000-4000-8000-000000000003';
const betId = (n: number) => `b1b1b1b1-0000-4000-8000-00000000000${n}`;

let round: Round;

async function bets(): Promise<MikroOrmBetRepository> {
  return new MikroOrmBetRepository((await testOrm()).em.fork());
}

function place(id: string, playerId: string, now: number, cents = 1_001): Bet {
  return Bet.place({
    id,
    round,
    playerId,
    amount: Money.fromCents(cents),
    now,
  });
}

beforeEach(async () => {
  const orm = await testOrm();
  for (const player of [P1, P2, P3]) await insertPlayer(orm, player);
  round = Round.create({
    id: ROUND_ID,
    serverSeed: ServerSeed.fromHex(SEED),
    bettingEndsAt: BETTING_ENDS_AT,
  });
  await new MikroOrmRoundRepository(orm.em.fork()).save(round);
});

/** Lê com lock dentro de uma transação, como faz o cash out (10.2). */
async function loadForUpdate(
  id: string,
  playerId: string,
): Promise<Bet | null> {
  return (await testOrm()).em
    .fork()
    .transactional((em) =>
      new MikroOrmBetRepository(em).getByIdAndPlayerForUpdate(id, playerId),
    );
}

describe('MikroOrmBetRepository', () => {
  it('save e getByIdAndPlayerForUpdate fazem ida e volta de PENDING e CASHED_OUT', async () => {
    const bet = place(betId(1), P1, BETTING_ENDS_AT - 5_000);
    await (await bets()).save(bet);
    const pending = await loadForUpdate(betId(1), P1);
    expect(pending?.status).toBe('PENDING');
    expect(pending?.amount.cents).toBe(1_001);
    expect(pending?.placedAt).toBe(BETTING_ENDS_AT - 5_000);

    round.start(BETTING_ENDS_AT);
    bet.cashOut({ round, now: BETTING_ENDS_AT + 30_000 });
    await (await bets()).save(bet);
    const cashed = await loadForUpdate(betId(1), P1);
    expect(cashed?.status).toBe('CASHED_OUT');
    expect(cashed?.cashoutMultiplier?.x100).toBe(604);
    expect(cashed?.payout?.cents).toBe(6_046);
  });

  it('getByIdAndPlayerForUpdate com outro jogador ou id inexistente devolve null', async () => {
    await (await bets()).save(place(betId(1), P1, BETTING_ENDS_AT - 1));
    expect(await loadForUpdate(betId(1), P2)).toBeNull();
    expect(await loadForUpdate(betId(9), P1)).toBeNull();
  });

  it('getByIdAndPlayerForUpdate fora de transação lança erro', async () => {
    await (await bets()).save(place(betId(1), P1, BETTING_ENDS_AT - 1));
    await expect(
      (await bets()).getByIdAndPlayerForUpdate(betId(1), P1),
    ).rejects.toThrow(ValidationError);
  });

  it('findByRoundAndPlayer, findByRound em ordem de placedAt e findPendingByRound', async () => {
    const late = place(betId(1), P1, BETTING_ENDS_AT - 1_000);
    const early = place(betId(2), P2, BETTING_ENDS_AT - 3_000);
    const middle = place(betId(3), P3, BETTING_ENDS_AT - 2_000);
    for (const bet of [late, early, middle]) await (await bets()).save(bet);

    round.start(BETTING_ENDS_AT);
    middle.cashOut({ round, now: BETTING_ENDS_AT + 1_000 });
    await (await bets()).save(middle);

    expect((await (await bets()).findByRoundAndPlayer(ROUND_ID, P2))?.id).toBe(
      betId(2),
    );
    expect(
      await (
        await bets()
      ).findByRoundAndPlayer('00000000-0000-4000-8000-000000000000', P2),
    ).toBeNull();
    expect(
      (await (await bets()).findByRound(ROUND_ID)).map((b) => b.id),
    ).toEqual([betId(2), betId(3), betId(1)]);
    expect(
      (await (await bets()).findPendingByRound(ROUND_ID)).map((b) => b.id),
    ).toEqual([betId(2), betId(1)]);
  });

  it('uma segunda aposta do jogador na rodada lança BetAlreadyPlacedError', async () => {
    await (await bets()).save(place(betId(1), P1, BETTING_ENDS_AT - 2));
    const duplicate = (await bets()).save(
      place(betId(2), P1, BETTING_ENDS_AT - 1),
    );
    await expect(duplicate).rejects.toThrow(BetAlreadyPlacedError);
    await expect(
      (await bets()).save(place(betId(3), P1, BETTING_ENDS_AT - 1)),
    ).rejects.toThrow(expect.objectContaining({ code: 'BET_ALREADY_PLACED' }));
  });

  it('concorrência: T2 espera o lock de T1 na aposta e só termina depois do commit', async () => {
    await (await bets()).save(place(betId(1), P1, BETTING_ENDS_AT - 1));
    round.start(BETTING_ENDS_AT);
    const orm = await testOrm();
    const t1Locked = deferred();
    const releaseT1 = deferred();
    const order: string[] = [];

    const t1 = orm.em.fork().transactional(async (em) => {
      const repo = new MikroOrmBetRepository(em);
      const bet = await repo.getByIdAndPlayerForUpdate(betId(1), P1);
      order.push('t1:locked');
      t1Locked.resolve();
      await releaseT1.promise;
      bet!.cashOut({ round, now: BETTING_ENDS_AT + 1_000 });
      await repo.save(bet!);
      order.push('t1:saved');
    });

    await t1Locked.promise;
    const t2 = orm.em.fork().transactional(async (em) => {
      const bet = await new MikroOrmBetRepository(em).getByIdAndPlayerForUpdate(
        betId(1),
        P1,
      );
      order.push(`t2:locked:${bet?.status}`);
    });

    try {
      await waitForBlockedLock(orm);
      order.push('t2:waiting');
    } finally {
      // Solta T1 mesmo se a espera falhar, para não travar os hooks seguintes.
      releaseT1.resolve();
      await Promise.allSettled([t1, t2]);
    }
    await Promise.all([t1, t2]);

    expect(order).toEqual([
      't1:locked',
      't2:waiting',
      't1:saved',
      't2:locked:CASHED_OUT',
    ]);
  });
});
