import type { RoundDto } from '@crash/shared';
import { describe, expect, it } from 'vitest';
import { secondsLeft } from './betting-countdown.js';

const ENDS_AT = 100_000;
const betting: RoundDto = {
  status: 'BETTING',
  id: '00000000-0000-4000-8000-0000000000a1',
  seedHash: 'h'.repeat(64),
  bettingEndsAt: ENDS_AT,
};

describe('secondsLeft (D100)', () => {
  it('BC1: arredonda para cima: 7000, 6001, 6000 e 200 ms → 7, 7, 6 e 1', () => {
    expect(secondsLeft(betting, ENDS_AT - 7_000)).toBe(7);
    expect(secondsLeft(betting, ENDS_AT - 6_001)).toBe(7);
    expect(secondsLeft(betting, ENDS_AT - 6_000)).toBe(6);
    expect(secondsLeft(betting, ENDS_AT - 200)).toBe(1);
  });

  it('BC2: com o prazo vencido some; nunca mostra 0 nem negativo, e só desce', () => {
    expect(secondsLeft(betting, ENDS_AT)).toBeNull();
    expect(secondsLeft(betting, ENDS_AT + 500)).toBeNull();

    let previous = Infinity;
    for (let remaining = 1_500; remaining >= -1_000; remaining -= 16) {
      const value = secondsLeft(betting, ENDS_AT - remaining);
      if (value === null) {
        previous = 0;
        continue;
      }
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });

  it('BC3: fora de BETTING não há contador', () => {
    const running: RoundDto = {
      ...betting,
      status: 'RUNNING',
      startedAt: ENDS_AT,
    };
    const crashed: RoundDto = {
      ...running,
      status: 'CRASHED',
      crashedAt: ENDS_AT + 5_000,
      crashPoint: 150,
      serverSeed: 's'.repeat(64),
    };
    // Mesmo com o relógio antes do bettingEndsAt (atraso do relógio local).
    for (const round of [running, crashed, null]) {
      expect(secondsLeft(round, ENDS_AT - 3_000)).toBeNull();
    }
  });
});
