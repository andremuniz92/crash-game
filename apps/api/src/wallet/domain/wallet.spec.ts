import { Money } from '../../shared/domain/money.js';
import { InsufficientBalanceError, Wallet } from './wallet.js';

const OPENED_AT = 1_700_000_000_000;

function sumOfEntries(wallet: Wallet): number {
  return wallet.entries.reduce((sum, entry) => sum + entry.amount, 0);
}

/** PRNG determinístico (mulberry32), para a sequência do teste de invariante. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('Wallet', () => {
  it('open cria a carteira com 100.000 centavos e um INITIAL_GRANT de +100.000', () => {
    const wallet = Wallet.open({ playerId: 'player-1', now: OPENED_AT });

    expect(wallet.playerId).toBe('player-1');
    expect(wallet.balance.cents).toBe(100_000);
    expect(wallet.entries).toEqual([
      {
        type: 'INITIAL_GRANT',
        amount: 100_000,
        betId: null,
        createdAt: OPENED_AT,
      },
    ]);
  });

  it('debit reduz o saldo e grava BET_PLACED negativo com betId e createdAt', () => {
    const wallet = Wallet.open({ playerId: 'player-1', now: OPENED_AT });
    wallet.debit(Money.fromCents(2_500), {
      betId: 'bet-1',
      now: OPENED_AT + 10,
    });

    expect(wallet.balance.cents).toBe(97_500);
    expect(wallet.entries.at(-1)).toEqual({
      type: 'BET_PLACED',
      amount: -2_500,
      betId: 'bet-1',
      createdAt: OPENED_AT + 10,
    });
  });

  it('debit acima do saldo lança InsufficientBalanceError sem alterar nada; o saldo exato zera', () => {
    const wallet = Wallet.open({ playerId: 'player-1', now: OPENED_AT });
    expect(() =>
      wallet.debit(Money.fromCents(100_001), {
        betId: 'bet-1',
        now: OPENED_AT,
      }),
    ).toThrow(InsufficientBalanceError);
    expect(wallet.balance.cents).toBe(100_000);
    expect(wallet.entries).toHaveLength(1);

    wallet.debit(Money.fromCents(100_000), { betId: 'bet-2', now: OPENED_AT });
    expect(wallet.balance.cents).toBe(0);
  });

  it('credit aumenta o saldo e grava CASHOUT positivo com betId', () => {
    const wallet = Wallet.open({ playerId: 'player-1', now: OPENED_AT });
    wallet.credit(Money.fromCents(6_046), {
      betId: 'bet-1',
      now: OPENED_AT + 20,
    });

    expect(wallet.balance.cents).toBe(106_046);
    expect(wallet.entries.at(-1)).toEqual({
      type: 'CASHOUT',
      amount: 6_046,
      betId: 'bet-1',
      createdAt: OPENED_AT + 20,
    });
  });

  it('em 1.000 operações determinísticas, o saldo é sempre igual à soma do extrato', () => {
    const random = seededRandom(42);
    const wallet = Wallet.open({ playerId: 'player-1', now: OPENED_AT });
    let failedDebits = 0;
    const violations: number[] = [];

    for (let step = 0; step < 1_000; step++) {
      const amount = Money.fromCents(1 + Math.floor(random() * 150_000));
      const context = { betId: `bet-${step}`, now: OPENED_AT + step };
      if (random() < 0.6) {
        try {
          wallet.debit(amount, context);
        } catch (error) {
          if (!(error instanceof InsufficientBalanceError)) throw error;
          failedDebits++;
        }
      } else {
        wallet.credit(amount, context);
      }
      if (wallet.balance.cents !== sumOfEntries(wallet)) violations.push(step);
    }

    expect(violations).toEqual([]);
    // A sequência precisa exercitar débitos recusados para o teste valer.
    expect(failedDebits).toBeGreaterThan(0);
  });

  it('o erro carrega o code INSUFFICIENT_BALANCE', () => {
    const wallet = Wallet.open({ playerId: 'player-1', now: OPENED_AT });
    expect(() =>
      wallet.debit(Money.fromCents(100_001), {
        betId: 'bet-1',
        now: OPENED_AT,
      }),
    ).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_BALANCE' }));
  });
});
