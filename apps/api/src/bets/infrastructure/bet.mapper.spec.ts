import { Money } from '../../shared/domain/money.js';
import { Multiplier } from '../../shared/domain/multiplier.js';
import { Bet, type BetSnapshot } from '../domain/bet.js';
import { betToDomain, betToRecord } from './bet.mapper.js';

const PLACED_AT = 1_700_000_005_000;

/** Snapshot válido, montado à mão para não depender de uma rodada. */
function bet(overrides: Partial<BetSnapshot> = {}): Bet {
  return Bet.restore({
    id: 'b1b1b1b1-0000-4000-8000-000000000001',
    roundId: 'a1a1a1a1-0000-4000-8000-000000000001',
    playerId: 'c1c1c1c1-0000-4000-8000-000000000001',
    amount: Money.fromCents(1_001),
    status: 'PENDING',
    cashoutMultiplier: null,
    payout: null,
    placedAt: PLACED_AT,
    ...overrides,
  });
}

describe('bet.mapper', () => {
  it('betToRecord converte VOs em colunas e placedAt em createdAt', () => {
    const cashed = bet({
      status: 'CASHED_OUT',
      cashoutMultiplier: Multiplier.fromX100(604),
      payout: Money.fromCents(6_046),
    });
    expect(betToRecord(cashed)).toEqual({
      id: cashed.id,
      roundId: cashed.roundId,
      playerId: cashed.playerId,
      amount: 1_001,
      status: 'CASHED_OUT',
      cashoutMultiplier: 604,
      payout: 6_046,
      createdAt: new Date(PLACED_AT),
    });
    expect(betToRecord(bet())).toMatchObject({
      cashoutMultiplier: null,
      payout: null,
    });
  });

  it('betToDomain(betToRecord(b)) reproduz a aposta nos três status', () => {
    const bets = [
      bet(),
      bet({ status: 'LOST' }),
      bet({
        status: 'CASHED_OUT',
        cashoutMultiplier: Multiplier.fromX100(604),
        payout: Money.fromCents(6_046),
      }),
    ];
    for (const original of bets) {
      const restored = betToDomain(betToRecord(original));
      expect(restored.status).toBe(original.status);
      expect(restored.placedAt).toBe(PLACED_AT);
      expect(betToRecord(restored)).toEqual(betToRecord(original));
    }
  });
});
