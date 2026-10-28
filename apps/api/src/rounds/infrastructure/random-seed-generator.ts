import { randomBytes } from 'node:crypto';
import type { SeedGenerator } from '../application/seed-generator.js';
import { ServerSeed } from '../domain/server-seed.js';

/** 32 bytes do gerador criptográfico, em hex (seção 6.1). */
export class RandomSeedGenerator implements SeedGenerator {
  newSeed(): ServerSeed {
    return ServerSeed.fromHex(randomBytes(32).toString('hex'));
  }
}
