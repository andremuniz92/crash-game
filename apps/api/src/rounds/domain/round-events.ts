import type { Multiplier } from '../../shared/domain/multiplier.js';
import type { SeedHash } from './seed-hash.js';
import type { ServerSeed } from './server-seed.js';

/*
 * Eventos de domínio da rodada (D31). Nenhum evento anterior ao crash
 * carrega crashPoint, crashAt ou serverSeed (D30).
 */

export interface RoundCreated {
  type: 'RoundCreated';
  roundId: string;
  seedHash: SeedHash;
  bettingEndsAt: number;
}

export interface RoundStarted {
  type: 'RoundStarted';
  roundId: string;
  startedAt: number;
}

export interface RoundCrashed {
  type: 'RoundCrashed';
  roundId: string;
  crashPoint: Multiplier;
  serverSeed: ServerSeed;
  crashedAt: number;
}

export type RoundEvent = RoundCreated | RoundStarted | RoundCrashed;
