import { describe, expect, it } from 'vitest';
import {
  GROWTH_RATE_PER_MS,
  MAX_BET_CENTS,
  MIN_BET_CENTS,
} from './constants.js';

describe('GROWTH_RATE_PER_MS', () => {
  it('leva o multiplicador a 2,00x em cerca de 11,6 s, como diz o CLAUDE.md', () => {
    const secondsToDouble = Math.log(2) / GROWTH_RATE_PER_MS / 1000;
    expect(secondsToDouble).toBeCloseTo(11.55, 1);
  });
});

describe('limites de aposta', () => {
  it('MIN_BET_CENTS é 100 (1,00) e MAX_BET_CENTS é 100.000 (1.000,00)', () => {
    expect(MIN_BET_CENTS).toBe(100);
    expect(MAX_BET_CENTS).toBe(100_000);
  });
});
