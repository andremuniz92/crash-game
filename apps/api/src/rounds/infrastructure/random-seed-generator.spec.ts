import { ServerSeed } from '../domain/server-seed.js';
import { RandomSeedGenerator } from './random-seed-generator.js';

describe('RandomSeedGenerator', () => {
  it('G3: gera uma ServerSeed válida, diferente a cada chamada', () => {
    const generator = new RandomSeedGenerator();
    const seeds = Array.from({ length: 100 }, () => generator.newSeed());
    for (const seed of seeds) {
      expect(seed).toBeInstanceOf(ServerSeed);
      // Passa de novo pela validação do VO: 64 caracteres hex minúsculos.
      expect(ServerSeed.fromHex(seed.toHex()).toHex()).toBe(seed.toHex());
    }
    expect(new Set(seeds.map((seed) => seed.toHex())).size).toBe(seeds.length);
  });
});
