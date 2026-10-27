import { inspect } from 'node:util';
import { SeedHash } from './seed-hash.js';
import { InvalidServerSeedError, ServerSeed } from './server-seed.js';

// Vetor calculado fora do projeto: printf %s <SEED> | sha256sum
const SEED = '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad';
const SEED_SHA256 =
  'a847e95cb5fe4092f6c9841ab7c94ab477ea581af57d08765ea9d203da6f7d4b';

describe('ServerSeed', () => {
  it('fromHex aceita 64 caracteres hex minúsculos e toHex devolve o mesmo valor', () => {
    expect(ServerSeed.fromHex(SEED).toHex()).toBe(SEED);
  });

  it('rejeita tamanho errado, caractere não hex e maiúsculas', () => {
    for (const invalid of [
      SEED.slice(0, 63),
      `${SEED}0`,
      `${SEED.slice(0, 63)}g`,
      SEED.toUpperCase(),
      '',
    ]) {
      expect(() => ServerSeed.fromHex(invalid)).toThrow(InvalidServerSeedError);
    }
  });

  it('hash() devolve o SHA-256 da string hex em UTF-8 (D23)', () => {
    const hash = ServerSeed.fromHex(SEED).hash();
    expect(hash).toBeInstanceOf(SeedHash);
    expect(hash.toHex()).toBe(SEED_SHA256);
  });

  it('não vaza em JSON.stringify, String() nem inspect; só sai por toHex()', () => {
    const seed = ServerSeed.fromHex(SEED);
    const outputs = [
      JSON.stringify(seed),
      JSON.stringify({ seed }),
      String(seed),
      inspect(seed),
      inspect({ seed }, { depth: 5 }),
    ];
    for (const output of outputs) {
      expect(output).not.toContain(SEED);
    }
  });

  it('o erro carrega o code INVALID_SERVER_SEED', () => {
    expect(() => ServerSeed.fromHex('xyz')).toThrow(
      expect.objectContaining({ code: 'INVALID_SERVER_SEED' }),
    );
  });
});
