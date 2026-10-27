import { describe, expect, it } from 'vitest';
import { multiplierAt, timeToCrash } from './multiplier.js';

/** Devolve o primeiro valor que viola o predicado, ou undefined se todos passam. */
function firstViolation(
  from: number,
  to: number,
  holds: (value: number) => boolean,
): number | undefined {
  for (let value = from; value <= to; value++) {
    if (!holds(value)) return value;
  }
  return undefined;
}

describe('multiplierAt', () => {
  it('começa em 100 (1,00x) no tempo zero', () => {
    expect(multiplierAt(0)).toBe(100);
  });

  it('trata tempo negativo como zero', () => {
    expect(multiplierAt(-1)).toBe(100);
    expect(multiplierAt(-5_000)).toBe(100);
  });

  it('passa de 199 para 200 entre 11.552 e 11.553 ms (2,00x em ~11,6 s)', () => {
    expect(multiplierAt(11_552)).toBe(199);
    expect(multiplierAt(11_553)).toBe(200);
  });

  it('chega a 10,00x em ~38,4 s e a 100,00x em ~76,8 s', () => {
    expect(multiplierAt(38_376)).toBe(999);
    expect(multiplierAt(38_377)).toBe(1_000);
    expect(multiplierAt(76_752)).toBe(9_999);
    expect(multiplierAt(76_753)).toBe(10_000);
  });

  it('devolve sempre um inteiro e nunca diminui com o tempo', () => {
    let previous = multiplierAt(0);
    const violation = firstViolation(1, 300_000, (ms) => {
      const current = multiplierAt(ms);
      const ok = Number.isInteger(current) && current >= previous;
      previous = current;
      return ok;
    });
    expect(violation).toBeUndefined();
  });
});

describe('timeToCrash', () => {
  it('é 0 para 1,00x (100)', () => {
    expect(timeToCrash(100)).toBe(0);
  });

  it('devolve ms inteiros que batem com as referências da seção 7.1', () => {
    expect(timeToCrash(200)).toBe(11_553);
    expect(timeToCrash(1_000)).toBe(38_377);
    expect(timeToCrash(10_000)).toBe(76_753);
  });

  it('é a inversa do multiplierAt para todo crash point de 1,00x a 1.000,00x', () => {
    const violation = firstViolation(100, 100_000, (crashPoint) => {
      const ms = timeToCrash(crashPoint);
      const reachedAtCrash = multiplierAt(ms) >= crashPoint;
      const belowJustBefore = ms === 0 || multiplierAt(ms - 1) < crashPoint;
      return reachedAtCrash && belowJustBefore;
    });
    expect(violation).toBeUndefined();
  });

  it('lança RangeError para crash point abaixo de 100 ou não inteiro', () => {
    expect(() => timeToCrash(99)).toThrow(RangeError);
    expect(() => timeToCrash(0)).toThrow(RangeError);
    expect(() => timeToCrash(150.5)).toThrow(RangeError);
    expect(() => timeToCrash(Number.NaN)).toThrow(RangeError);
  });

  it('devolve um inteiro seguro perto de 230 s para o teto de 1.000.000,00x', () => {
    const ms = timeToCrash(100_000_000);
    expect(Number.isSafeInteger(ms)).toBe(true);
    expect(ms).toBe(230_259);
  });
});
