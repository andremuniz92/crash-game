import { InvalidSeedHashError, SeedHash } from './seed-hash.js';
import { ServerSeed } from './server-seed.js';

const SEED = '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad';
const OTHER_SEED =
  'dabbdcfa82ee4f2e349ef253955ca74a8cdc6abde9f63f87840a9659bf665921';
const SEED_SHA256 =
  'a847e95cb5fe4092f6c9841ab7c94ab477ea581af57d08765ea9d203da6f7d4b';

describe('SeedHash', () => {
  it('fromHex aceita 64 caracteres hex minúsculos e rejeita os inválidos', () => {
    expect(SeedHash.fromHex(SEED_SHA256).toHex()).toBe(SEED_SHA256);
    for (const invalid of [
      SEED_SHA256.slice(1),
      SEED_SHA256.toUpperCase(),
      'z'.repeat(64),
    ]) {
      expect(() => SeedHash.fromHex(invalid)).toThrow(InvalidSeedHashError);
    }
  });

  it('é igual por valor', () => {
    expect(
      SeedHash.fromHex(SEED_SHA256).equals(SeedHash.fromHex(SEED_SHA256)),
    ).toBe(true);
    expect(
      SeedHash.fromHex(SEED_SHA256).equals(
        ServerSeed.fromHex(OTHER_SEED).hash(),
      ),
    ).toBe(false);
  });

  it('matches(seed) é verdadeiro para a seed certa e falso para outra', () => {
    const hash = SeedHash.fromHex(SEED_SHA256);
    expect(hash.matches(ServerSeed.fromHex(SEED))).toBe(true);
    expect(hash.matches(ServerSeed.fromHex(OTHER_SEED))).toBe(false);
  });

  it('o erro carrega o code INVALID_SEED_HASH', () => {
    expect(() => SeedHash.fromHex('')).toThrow(
      expect.objectContaining({ code: 'INVALID_SEED_HASH' }),
    );
  });
});
