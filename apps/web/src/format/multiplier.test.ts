import { describe, expect, it } from 'vitest';
import { formatMultiplier } from './multiplier.js';

describe('formatMultiplier', () => {
  it.each([
    [100, '1,00x'],
    [157, '1,57x'],
    [100_000_000, '1.000.000,00x'],
  ])('FM1: %i (×100) → "%s"', (x100, text) => {
    expect(formatMultiplier(x100)).toBe(text);
  });

  it.each([157.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'FM1: multiplicador que não é inteiro ×100 (%s) lança RangeError',
    (x100) => {
      expect(() => formatMultiplier(x100)).toThrow(RangeError);
      expect(() => formatMultiplier(x100)).toThrow(/multiplicador/);
    },
  );
});
