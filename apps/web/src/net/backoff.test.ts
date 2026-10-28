import { describe, expect, it } from 'vitest';
import { backoffDelay } from './backoff.js';

const top = () => 1;

describe('backoffDelay (D76)', () => {
  it('B1: com random = 1, dobra a partir de 500 ms até o teto de 10 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, top))).toEqual([
      500, 1_000, 2_000, 4_000, 8_000, 10_000, 10_000,
    ]);
  });

  it('B2: nunca passa de 10 s, nem quando 2^tentativa vira Infinity', () => {
    expect(backoffDelay(50, top)).toBe(10_000);
    expect(backoffDelay(2_000, top)).toBe(10_000);
  });

  it('B3: aplica o jitter: random = 0 dá 0; random = 0,5 na tentativa 3 dá 2 s', () => {
    expect(backoffDelay(3, () => 0)).toBe(0);
    expect(backoffDelay(3, () => 0.5)).toBe(2_000);
  });
});
