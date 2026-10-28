import type { ServerSeed } from '../domain/server-seed.js';

/** Gera a seed secreta de cada rodada (D22). */
export interface SeedGenerator {
  newSeed(): ServerSeed;
}
