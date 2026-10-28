import type { InferEntity } from '@mikro-orm/core';
import { Multiplier } from '../../shared/domain/multiplier.js';
import { toDate, toMs } from '../../shared/infrastructure/database/time.js';
import { Round } from '../domain/round.js';
import { SeedHash } from '../domain/seed-hash.js';
import { ServerSeed } from '../domain/server-seed.js';
import type { RoundRecord } from './round.record.js';

export type RoundRow = InferEntity<typeof RoundRecord>;

/** Rodada → linha de `rounds` (D41). Inclui os segredos: só a persistência usa (D47). */
export function roundToRecord(round: Round): RoundRow {
  const s = round.toSnapshot();
  return {
    id: s.id,
    status: s.status,
    serverSeed: s.serverSeed.toHex(),
    seedHash: s.seedHash.toHex(),
    crashPoint: s.crashPoint.x100,
    bettingEndsAt: toDate(s.bettingEndsAt),
    startedAt: toDate(s.startedAt),
    crashAt: toDate(s.crashAt),
    crashedAt: toDate(s.crashedAt),
  };
}

/** Linha → rodada. O `Round.restore` confere a integridade (D41). */
export function roundToDomain(row: RoundRow): Round {
  return Round.restore({
    id: row.id,
    status: row.status,
    serverSeed: ServerSeed.fromHex(row.serverSeed),
    seedHash: SeedHash.fromHex(row.seedHash),
    crashPoint: Multiplier.fromX100(row.crashPoint),
    bettingEndsAt: toMs(row.bettingEndsAt),
    startedAt: toMs(row.startedAt ?? null),
    crashAt: toMs(row.crashAt ?? null),
    crashedAt: toMs(row.crashedAt ?? null),
  });
}
