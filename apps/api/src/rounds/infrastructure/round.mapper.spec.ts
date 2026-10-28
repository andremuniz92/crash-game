import { CorruptedRoundError, Round } from '../domain/round.js';
import { ServerSeed } from '../domain/server-seed.js';
import { roundToDomain, roundToRecord } from './round.mapper.js';

/* Vetor da Fase 2 do M1: 1,26x, crash em 3.852 ms. */
const SEED = '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad';
const ROUND_ID = '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60';
const BETTING_ENDS_AT = 1_700_000_010_000;
const CRASH_AT = BETTING_ENDS_AT + 3_852;

function round(state: 'BETTING' | 'RUNNING' | 'CRASHED'): Round {
  const r = Round.create({
    id: ROUND_ID,
    serverSeed: ServerSeed.fromHex(SEED),
    bettingEndsAt: BETTING_ENDS_AT,
  });
  if (state !== 'BETTING') r.start(BETTING_ENDS_AT);
  if (state === 'CRASHED') r.crash(CRASH_AT);
  return r;
}

describe('round.mapper', () => {
  it('roundToRecord converte VOs em colunas e ms em Date', () => {
    expect(roundToRecord(round('CRASHED'))).toEqual({
      id: ROUND_ID,
      status: 'CRASHED',
      serverSeed: SEED,
      seedHash: ServerSeed.fromHex(SEED).hash().toHex(),
      crashPoint: 126,
      bettingEndsAt: new Date(BETTING_ENDS_AT),
      startedAt: new Date(BETTING_ENDS_AT),
      crashAt: new Date(CRASH_AT),
      crashedAt: new Date(CRASH_AT),
    });
    expect(roundToRecord(round('BETTING'))).toMatchObject({
      startedAt: null,
      crashAt: null,
      crashedAt: null,
    });
  });

  it('roundToDomain(roundToRecord(r)) reproduz a rodada em cada estado', () => {
    for (const state of ['BETTING', 'RUNNING', 'CRASHED'] as const) {
      const original = round(state);
      const restored = roundToDomain(roundToRecord(original));
      expect(restored.status).toBe(state);
      expect(restored.startedAt).toBe(original.startedAt);
      expect(restored.crashedAt).toBe(original.crashedAt);
      expect(roundToRecord(restored)).toEqual(roundToRecord(original));
    }
  });

  it('roundToDomain de uma linha adulterada lança CorruptedRoundError', () => {
    const row = { ...roundToRecord(round('RUNNING')), crashPoint: 500 };
    expect(() => roundToDomain(row)).toThrow(CorruptedRoundError);
  });
});
