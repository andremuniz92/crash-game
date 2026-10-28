import type { InferEntity } from '@mikro-orm/core';
import { Money } from '../../shared/domain/money.js';
import { Multiplier } from '../../shared/domain/multiplier.js';
import { toDate, toMs } from '../../shared/infrastructure/database/time.js';
import { Bet } from '../domain/bet.js';
import type { BetRecord } from './bet.record.js';

export type BetRow = InferEntity<typeof BetRecord>;

/** Aposta → linha de `bets` (D41). `placedAt` vai para `created_at` (D45). */
export function betToRecord(bet: Bet): BetRow {
  const s = bet.toSnapshot();
  return {
    id: s.id,
    roundId: s.roundId,
    playerId: s.playerId,
    amount: s.amount.cents,
    status: s.status,
    cashoutMultiplier: s.cashoutMultiplier?.x100 ?? null,
    payout: s.payout?.cents ?? null,
    createdAt: toDate(s.placedAt),
  };
}

/** Linha → aposta. O `Bet.restore` confere a coerência de status e payout. */
export function betToDomain(row: BetRow): Bet {
  return Bet.restore({
    id: row.id,
    roundId: row.roundId,
    playerId: row.playerId,
    amount: Money.fromCents(row.amount),
    status: row.status,
    cashoutMultiplier:
      row.cashoutMultiplier == null
        ? null
        : Multiplier.fromX100(row.cashoutMultiplier),
    payout: row.payout == null ? null : Money.fromCents(row.payout),
    placedAt: toMs(row.createdAt),
  });
}
