import { testOrm } from '../../../test/integration/test-orm.js';
import { MikroOrmPlayerStore } from '../../players/mikro-orm-player-store.js';
import { Round } from '../../rounds/domain/round.js';
import { ServerSeed } from '../../rounds/domain/server-seed.js';
import { MikroOrmRoundRepository } from '../../rounds/infrastructure/mikro-orm-round.repository.js';
import { Money } from '../../shared/domain/money.js';
import { Bet } from '../domain/bet.js';
import { BetQueries } from './bet-queries.js';
import { MikroOrmBetRepository } from './mikro-orm-bet.repository.js';

const T0 = Date.parse('2026-10-28T12:00:00.000Z');
const ANA = 'a0a0a0a0-0000-4000-8000-000000000001';
const BIA = 'a0a0a0a0-0000-4000-8000-000000000002';
const OLD = '00000000-0000-4000-8000-0000000000a1';
const CURRENT = '00000000-0000-4000-8000-0000000000a2';
const bet = (n: number) => `b0b0b0b0-0000-4000-8000-00000000000${n}`;

async function em() {
  return (await testOrm()).em.fork();
}

function round(id: string, bettingEndsAt: number): Round {
  return Round.create({
    id,
    serverSeed: ServerSeed.fromHex('d'.repeat(64)),
    bettingEndsAt,
  });
}

function place(
  id: string,
  r: Round,
  playerId: string,
  now: number,
  cents: number,
) {
  return Bet.place({
    id,
    round: r,
    playerId,
    amount: Money.fromCents(cents),
    now,
  });
}

beforeEach(async () => {
  for (const [id, nickname] of [
    [ANA, 'ana'],
    [BIA, 'bia'],
  ] as const) {
    await new MikroOrmPlayerStore(await em()).insert({
      id,
      nickname,
      tokenHash: id.replaceAll('-', '').padEnd(64, '0'),
      createdAt: T0,
    });
  }

  // Rodada antiga, já crashada, com uma aposta da ana.
  const old = round(OLD, T0);
  const oldBet = place(bet(1), old, ANA, T0 - 10, 500);
  old.start(T0);
  old.crash(T0 + 600_000);
  await new MikroOrmRoundRepository(await em()).save(old);
  await new MikroOrmBetRepository(await em()).save(oldBet);

  // Rodada atual: a bia aposta antes da ana.
  const current = round(CURRENT, T0 + 700_000);
  await new MikroOrmRoundRepository(await em()).save(current);
  const bets = new MikroOrmBetRepository(await em());
  await bets.save(place(bet(2), current, ANA, T0 + 690_002, 2_000));
  await bets.save(place(bet(3), current, BIA, T0 + 690_001, 1_500));
});

describe('BetQueries', () => {
  it('Q2: apostas da rodada com betId e nickname, sem playerId, por ordem de aposta, só da rodada pedida', async () => {
    const queries = new BetQueries(await testOrm());

    expect(await queries.betsOf(CURRENT)).toEqual([
      {
        betId: bet(3),
        nickname: 'bia',
        amount: 1_500,
        status: 'PENDING',
        cashoutMultiplier: null,
        payout: null,
      },
      {
        betId: bet(2),
        nickname: 'ana',
        amount: 2_000,
        status: 'PENDING',
        cashoutMultiplier: null,
        payout: null,
      },
    ]);
  });

  it('Q2: myBet devolve a aposta do jogador na rodada, com betId, ou null', async () => {
    const queries = new BetQueries(await testOrm());

    expect(await queries.myBet(CURRENT, ANA)).toEqual({
      betId: bet(2),
      amount: 2_000,
      status: 'PENDING',
      cashoutMultiplier: null,
      payout: null,
    });
    expect(await queries.myBet(OLD, BIA)).toBeNull();
  });
});
