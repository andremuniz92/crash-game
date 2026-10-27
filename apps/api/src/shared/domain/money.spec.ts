import { InvalidMoneyError, Money } from './money.js';
import { Multiplier } from './multiplier.js';

describe('Money', () => {
  it('cria a partir de centavos inteiros >= 0 e expõe cents', () => {
    expect(Money.fromCents(0).cents).toBe(0);
    expect(Money.fromCents(100_000).cents).toBe(100_000);
  });

  it('rejeita negativo, não inteiro, NaN e valor acima de MAX_SAFE_INTEGER', () => {
    for (const invalid of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => Money.fromCents(invalid)).toThrow(InvalidMoneyError);
    }
  });

  it('add soma', () => {
    expect(Money.fromCents(150).add(Money.fromCents(250)).cents).toBe(400);
  });

  it('subtract subtrai e aceita resultado zero', () => {
    expect(Money.fromCents(500).subtract(Money.fromCents(200)).cents).toBe(300);
    expect(Money.fromCents(500).subtract(Money.fromCents(500)).cents).toBe(0);
  });

  it('subtract lança InvalidMoneyError se o resultado ficar negativo', () => {
    expect(() => Money.fromCents(100).subtract(Money.fromCents(101))).toThrow(
      InvalidMoneyError,
    );
  });

  it('multiply arredonda para baixo (1001 × 1,57x = 1571,57 → 1571)', () => {
    const payout = Money.fromCents(1_001).multiply(Multiplier.fromX100(157));
    expect(payout.cents).toBe(1_571);
  });

  it('multiply é exato onde o ponto flutuante erraria e no limite do teto', () => {
    // Em float, 1.15 * 100 = 114.99999999999999.
    expect(Money.fromCents(100).multiply(Multiplier.fromX100(115)).cents).toBe(
      115,
    );
    const maxBet = Money.fromCents(100_000);
    const cap = Multiplier.fromX100(100_000_000);
    expect(maxBet.multiply(cap).cents).toBe(100_000_000_000);
  });

  it('é igual por valor e as operações não alteram a instância original', () => {
    const original = Money.fromCents(1_000);
    original.add(Money.fromCents(1));
    original.subtract(Money.fromCents(1));
    original.multiply(Multiplier.fromX100(200));

    expect(original.cents).toBe(1_000);
    expect(original.equals(Money.fromCents(1_000))).toBe(true);
    expect(original.equals(Money.fromCents(999))).toBe(false);
  });

  it('o erro carrega o code INVALID_MONEY', () => {
    expect(() => Money.fromCents(-1)).toThrow(
      expect.objectContaining({ code: 'INVALID_MONEY' }),
    );
  });
});
