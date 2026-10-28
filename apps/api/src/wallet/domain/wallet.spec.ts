import { Money } from '../../shared/domain/money.js';
import {
  CorruptedWalletError,
  InsufficientBalanceError,
  Wallet,
} from './wallet.js';

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

describe('Wallet: lançamentos novos, snapshot e restore', () => {
  const ctx = (betId: string, now = OPENED_AT + 1) => ({ betId, now });

  it('depois do open, pullNewEntries devolve o INITIAL_GRANT e esvazia a lista', () => {
    const wallet = Wallet.open({ playerId: 'player-1', now: OPENED_AT });
    expect(wallet.pullNewEntries()).toEqual([
      {
        type: 'INITIAL_GRANT',
        amount: 100_000,
        betId: null,
        createdAt: OPENED_AT,
      },
    ]);
    expect(wallet.pullNewEntries()).toEqual([]);
  });

  it('debit e credit depois de um pull aparecem só no pull seguinte, em ordem', () => {
    const wallet = Wallet.open({ playerId: 'player-1', now: OPENED_AT });
    wallet.pullNewEntries();
    wallet.debit(Money.fromCents(1_000), ctx('bet-1'));
    wallet.credit(Money.fromCents(6_040), ctx('bet-1', OPENED_AT + 2));

    expect(wallet.pullNewEntries().map((e) => [e.type, e.amount])).toEqual([
      ['BET_PLACED', -1_000],
      ['CASHOUT', 6_040],
    ]);
    expect(wallet.pullNewEntries()).toEqual([]);
  });

  it('restore traz saldo e versão e começa sem lançamentos', () => {
    const wallet = Wallet.restore({
      playerId: 'player-1',
      balance: Money.fromCents(4_321),
      version: 7,
    });
    expect(wallet.playerId).toBe('player-1');
    expect(wallet.balance.cents).toBe(4_321);
    expect(wallet.version).toBe(7);
    expect(wallet.entries).toEqual([]);
    expect(wallet.pullNewEntries()).toEqual([]);
  });

  it('numa carteira reconstruída, o debit respeita o saldo e saldo = reconstruído + novos', () => {
    const restoredBalance = 4_321;
    const wallet = Wallet.restore({
      playerId: 'player-1',
      balance: Money.fromCents(restoredBalance),
      version: 7,
    });
    expect(() =>
      wallet.debit(Money.fromCents(restoredBalance + 1), ctx('bet-1')),
    ).toThrow(InsufficientBalanceError);

    wallet.debit(Money.fromCents(1_000), ctx('bet-2'));
    wallet.credit(Money.fromCents(2_500), ctx('bet-2'));
    const added = wallet
      .pullNewEntries()
      .reduce((sum, entry) => sum + entry.amount, 0);
    expect(wallet.balance.cents).toBe(restoredBalance + added);
    expect(wallet.balance.cents).toBe(5_821);
  });

  it('toSnapshot devolve playerId, saldo e versão; open começa na versão 0', () => {
    const opened = Wallet.open({ playerId: 'player-1', now: OPENED_AT });
    const snapshot = opened.toSnapshot();
    expect(snapshot.playerId).toBe('player-1');
    expect(snapshot.balance.cents).toBe(100_000);
    expect(snapshot.version).toBe(0);
    expect(Object.keys(snapshot).sort()).toEqual(
      ['balance', 'playerId', 'version'].sort(),
    );

    const restored = Wallet.restore({ ...snapshot, version: 3 });
    expect(restored.toSnapshot().version).toBe(3);
  });

  it('restore lança CorruptedWalletError (CORRUPTED_WALLET) com versão inválida', () => {
    for (const version of [-1, 1.5, Number.NaN]) {
      expect(() =>
        Wallet.restore({
          playerId: 'player-1',
          balance: Money.fromCents(0),
          version,
        }),
      ).toThrow(CorruptedWalletError);
    }
    expect(() =>
      Wallet.restore({
        playerId: 'player-1',
        balance: Money.fromCents(0),
        version: -1,
      }),
    ).toThrow(expect.objectContaining({ code: 'CORRUPTED_WALLET' }));
  });
});
