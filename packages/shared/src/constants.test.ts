import { describe, expect, it } from 'vitest';
import { GROWTH_RATE_PER_MS } from './constants.js';

describe('GROWTH_RATE_PER_MS', () => {
  it('leva o multiplicador a 2,00x em cerca de 11,6 s, como diz o CLAUDE.md', () => {
    const secondsToDouble = Math.log(2) / GROWTH_RATE_PER_MS / 1000;
    expect(secondsToDouble).toBeCloseTo(11.55, 1);
  });
});
