import { createHash } from 'node:crypto';
import {
  crashPointFor,
  crashPointFromInt52,
  InvalidRoundHashError,
  InvalidRoundIdError,
  roundHashInt52,
} from './crash-point.js';
import { ServerSeed } from './server-seed.js';

const E = 2 ** 52;
const CAP = 100_000_000;

/*
 * Vetores calculados fora do projeto, antes da implementação:
 *   hmac = printf %s <roundId> | openssl dgst -sha256 -hmac <serverSeed>
 *   h    = BigInt('0x' + hmac.slice(0, 13)); resto da fórmula em BigInt.
 */
const VECTORS = [
  {
    seed: '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad',
    roundId: '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60',
    h: 953_534_720_229_610,
    crashPoint: 126,
  },
  {
    seed: 'dabbdcfa82ee4f2e349ef253955ca74a8cdc6abde9f63f87840a9659bf665921',
    roundId: '11111111-2222-4333-8444-000000000004',
    h: 4_222_198_948_821_031,
    crashPoint: 1_585,
  },
  {
    // h % 33 === 0: crash instantâneo
    seed: '4ea5e13de9e0aa99a3c8cb6c5ea849b44783b31f8a6056062203142341f07dfe',
    roundId: '00000000-0000-4000-8000-000000000034',
    h: 1_419_023_157_963_675,
    crashPoint: 100,
  },
];

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Amostra determinística: seed e roundId derivados do índice. */
function sample(index: number): { seed: ServerSeed; roundId: string } {
  const x = sha256Hex(`round-${index}`);
  const roundId = `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-8${x.slice(17, 20)}-${x.slice(20, 32)}`;
  return { seed: ServerSeed.fromHex(sha256Hex(`seed-${index}`)), roundId };
}

describe('crashPointFromInt52', () => {
  it('dá 1,00x quando h é divisível por 33', () => {
    // E − 4 é múltiplo de 33 e, sem a regra, daria um crash point enorme.
    for (const h of [0, 33, E - 4]) {
      expect(h % 33).toBe(0);
      expect(crashPointFromInt52(h).x100).toBe(100);
    }
  });

  it('dá exatamente 1,99x para h = 2^51', () => {
    expect(crashPointFromInt52(2 ** 51).x100).toBe(199);
  });

  it('aplica o teto para h = 2^52 − 1 e não corta o valor logo abaixo dele', () => {
    expect(crashPointFromInt52(E - 1).x100).toBe(CAP);
    // Maior h cuja fórmula fica abaixo do teto (calculado em BigInt).
    expect(crashPointFromInt52(4_503_595_168_806_820).x100).toBe(CAP - 1);
  });

  it('rejeita h fora de [0, 2^52) ou não inteiro', () => {
    for (const invalid of [-1, E, E + 1, 1.5, Number.NaN]) {
      expect(() => crashPointFromInt52(invalid)).toThrow(InvalidRoundHashError);
    }
  });

  it('o erro carrega o code INVALID_ROUND_HASH', () => {
    expect(() => crashPointFromInt52(-1)).toThrow(
      expect.objectContaining({ code: 'INVALID_ROUND_HASH' }),
    );
  });
});

describe('roundHashInt52', () => {
  it('extrai h dos 13 primeiros caracteres hex do HMAC', () => {
    for (const v of VECTORS) {
      expect(roundHashInt52(ServerSeed.fromHex(v.seed), v.roundId)).toBe(v.h);
    }
  });

  it('rejeita roundId fora do formato canônico (D23)', () => {
    const seed = ServerSeed.fromHex(VECTORS[0]!.seed);
    for (const invalid of [
      VECTORS[0]!.roundId.toUpperCase(),
      VECTORS[0]!.roundId.replaceAll('-', ''),
      'not-a-uuid',
    ]) {
      expect(() => roundHashInt52(seed, invalid)).toThrow(InvalidRoundIdError);
    }
  });
});

describe('crashPointFor', () => {
  it('reproduz os vetores calculados fora do projeto', () => {
    for (const v of VECTORS) {
      expect(crashPointFor(ServerSeed.fromHex(v.seed), v.roundId).x100).toBe(
        v.crashPoint,
      );
    }
  });

  describe('em 100 mil amostras determinísticas', () => {
    const SAMPLES = 100_000;
    const hashes: number[] = [];
    const crashPoints: number[] = [];

    beforeAll(() => {
      for (let i = 0; i < SAMPLES; i++) {
        const { seed, roundId } = sample(i);
        hashes.push(roundHashInt52(seed, roundId));
        crashPoints.push(crashPointFor(seed, roundId).x100);
      }
    });

    it('tem ~3% de crash instantâneo, ~4% do total em 1,00x e mediana perto de 1,9x', () => {
      const instant = hashes.filter((h) => h % 33 === 0).length / SAMPLES;
      const atOne = crashPoints.filter((c) => c === 100).length / SAMPLES;
      const median = [...crashPoints].sort((a, b) => a - b)[SAMPLES / 2]!;

      expect(instant).toBeGreaterThanOrEqual(0.028);
      expect(instant).toBeLessThanOrEqual(0.033);
      expect(atOne).toBeGreaterThanOrEqual(0.037);
      expect(atOne).toBeLessThanOrEqual(0.043);
      expect(median).toBeGreaterThanOrEqual(185);
      expect(median).toBeLessThanOrEqual(200);
    });

    it('sempre fica entre 100 e o teto', () => {
      expect(crashPoints.every((c) => c >= 100 && c <= CAP)).toBe(true);
    });
  });
});
