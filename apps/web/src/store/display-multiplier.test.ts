import {
  MAX_MULTIPLIER_X100,
  type RoundDto,
  type RunningRoundDto,
} from '@crash/shared';
import { describe, expect, it } from 'vitest';
import { formatMultiplier } from '../format/multiplier.js';
import { displayMultiplier } from './display-multiplier.js';

const STARTED_AT = 1_800_000_000_000;
const betting: RoundDto = {
  status: 'BETTING',
  id: '00000000-0000-4000-8000-0000000000a1',
  seedHash: 'h'.repeat(64),
  bettingEndsAt: STARTED_AT,
};
const running: RunningRoundDto = {
  ...betting,
  status: 'RUNNING',
  startedAt: STARTED_AT,
};
const crashed: RoundDto = {
  ...running,
  status: 'CRASHED',
  crashedAt: STARTED_AT + 20_000,
  crashPoint: 235,
  serverSeed: 's'.repeat(64),
};
/** Dado corrompido em tempo de execução: RUNNING sem startedAt. */
const withoutStartedAt = {
  ...betting,
  status: 'RUNNING',
} as unknown as RoundDto;

describe('displayMultiplier', () => {
  it('DM1: sem rodada, null ("—")', () => {
    expect(displayMultiplier(null, STARTED_AT)).toBeNull();
  });

  it('DM2: em BETTING, 1,00x', () => {
    expect(displayMultiplier(betting, STARTED_AT - 5_000)).toBe(100);
  });

  it('DM3: em RUNNING, o multiplierAt do tempo decorrido (2,00x em 11.553 ms)', () => {
    expect(displayMultiplier(running, STARTED_AT + 11_553)).toBe(200);
    expect(displayMultiplier(running, STARTED_AT + 11_552)).toBe(199);
  });

  it('DM4: com o serverNow antes do startedAt (offset atrasado), 1,00x', () => {
    expect(displayMultiplier(running, STARTED_AT - 300)).toBe(100);
  });

  it('DM5: RUNNING sem startedAt (dado corrompido), null', () => {
    expect(displayMultiplier(withoutStartedAt, STARTED_AT)).toBeNull();
  });

  it('DM6: tempo NaN, null', () => {
    expect(displayMultiplier(running, Number.NaN)).toBeNull();
  });

  it('DM7: tempo Infinity, null', () => {
    expect(displayMultiplier(running, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('DM8: tempo finito e enorme fica no teto de 1.000.000,00x (D24)', () => {
    expect(displayMultiplier(running, STARTED_AT + 1_000_000)).toBe(
      MAX_MULTIPLIER_X100,
    );
  });

  it('DM9: em CRASHED, o crash point exato, mesmo com o relógio indicando mais', () => {
    expect(displayMultiplier(crashed, STARTED_AT + 60_000)).toBe(235);
  });

  it('DM10: sempre null ou inteiro seguro de 100 ao teto, que o formatMultiplier aceita', () => {
    const cases: [RoundDto | null, number][] = [
      [null, STARTED_AT],
      [betting, STARTED_AT],
      [running, STARTED_AT + 11_553],
      [running, STARTED_AT - 300],
      [withoutStartedAt, STARTED_AT],
      [running, Number.NaN],
      [running, Number.POSITIVE_INFINITY],
      [running, Number.NEGATIVE_INFINITY],
      [running, STARTED_AT + 1_000_000],
      [running, STARTED_AT + 230_259],
      [crashed, STARTED_AT + 60_000],
    ];
    for (const [round, serverNow] of cases) {
      const value = displayMultiplier(round, serverNow);
      if (value === null) continue;
      expect(Number.isSafeInteger(value), `${serverNow}`).toBe(true);
      expect(value).toBeGreaterThanOrEqual(100);
      expect(value).toBeLessThanOrEqual(MAX_MULTIPLIER_X100);
      expect(() => formatMultiplier(value)).not.toThrow();
    }
  });
});
