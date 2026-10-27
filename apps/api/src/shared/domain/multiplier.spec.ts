import { InvalidMultiplierError, Multiplier } from './multiplier.js';

describe('Multiplier', () => {
  it('aceita 100 (1,00x) e o teto 100.000.000 (1.000.000,00x) e expõe x100', () => {
    expect(Multiplier.fromX100(100).x100).toBe(100);
    expect(Multiplier.fromX100(100_000_000).x100).toBe(100_000_000);
  });

  it('rejeita abaixo de 100, acima do teto, não inteiro e NaN', () => {
    for (const invalid of [99, 100_000_001, 150.5, Number.NaN]) {
      expect(() => Multiplier.fromX100(invalid)).toThrow(
        InvalidMultiplierError,
      );
    }
  });

  it('é igual por valor', () => {
    expect(Multiplier.fromX100(157).equals(Multiplier.fromX100(157))).toBe(
      true,
    );
    expect(Multiplier.fromX100(157).equals(Multiplier.fromX100(158))).toBe(
      false,
    );
  });

  it('o erro carrega o code INVALID_MULTIPLIER', () => {
    expect(() => Multiplier.fromX100(99)).toThrow(
      expect.objectContaining({ code: 'INVALID_MULTIPLIER' }),
    );
  });
});
