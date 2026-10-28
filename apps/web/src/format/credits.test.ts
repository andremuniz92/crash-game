import { describe, expect, it } from 'vitest';
import { formatCredits, parseCreditsInput } from './credits.js';

describe('formatCredits', () => {
  it.each([
    [0, '0,00'],
    [5, '0,05'],
    [150, '1,50'],
    [100_050, '1.000,50'],
    [123_456_789, '1.234.567,89'],
  ])('FC1: %i centavos → "%s"', (cents, text) => {
    expect(formatCredits(cents)).toBe(text);
  });

  it.each([
    [-150, '-1,50'],
    [-5, '-0,05'],
  ])('FC2: lançamento negativo do extrato, %i → "%s"', (cents, text) => {
    expect(formatCredits(cents)).toBe(text);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'FC3: centavos que não são inteiros (%s) lançam RangeError',
    (cents) => {
      expect(() => formatCredits(cents)).toThrow(RangeError);
      expect(() => formatCredits(cents)).toThrow(/centavos/);
    },
  );
});

describe('parseCreditsInput (D79)', () => {
  it.each([
    ['10', 1_000],
    ['10,5', 1_050],
    ['10,50', 1_050],
    ['10.50', 1_050],
    [' 10,50 ', 1_050],
    ['007', 700],
  ])('P1: aceita "%s" → %i centavos', (text, cents) => {
    expect(parseCreditsInput(text)).toEqual({ ok: true, cents });
  });

  it.each([
    '1.000',
    '1,000',
    '10,505',
    '10,5,0',
    '10,',
    ',5',
    '',
    '  ',
    '-5',
    '+5',
    'abc',
    '1e3',
  ])('P2: recusa "%s" por formato', (text) => {
    expect(parseCreditsInput(text)).toEqual({ ok: false, error: 'FORMAT' });
  });

  it('P3: aplica os limites do @crash/shared, inclusive nas bordas', () => {
    expect(parseCreditsInput('1')).toEqual({ ok: true, cents: 100 });
    expect(parseCreditsInput('1000')).toEqual({ ok: true, cents: 100_000 });
    expect(parseCreditsInput('0,99')).toEqual({
      ok: false,
      error: 'BELOW_MIN',
    });
    expect(parseCreditsInput('0')).toEqual({ ok: false, error: 'BELOW_MIN' });
    expect(parseCreditsInput('1000,01')).toEqual({
      ok: false,
      error: 'ABOVE_MAX',
    });
  });

  it('P4: converte sem float (1.15 × 100 daria 114,99999999999999)', () => {
    expect(parseCreditsInput('1,15')).toEqual({ ok: true, cents: 115 });
    expect(parseCreditsInput('0,29')).toEqual({
      ok: false,
      error: 'BELOW_MIN',
    });
    expect(parseCreditsInput('2,29')).toEqual({ ok: true, cents: 229 });
  });

  it('P5: número gigante fica acima do máximo, sem perder precisão', () => {
    expect(parseCreditsInput('99999999999999999999')).toEqual({
      ok: false,
      error: 'ABOVE_MAX',
    });
  });
});
