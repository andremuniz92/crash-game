import type { Money } from '../../shared/domain/money.js';
import type { Multiplier } from '../../shared/domain/multiplier.js';

/* Eventos de domínio das apostas (D31). */

export interface BetPlaced {
  type: 'BetPlaced';
  betId: string;
  roundId: string;
  playerId: string;
  amount: Money;
}

export interface BetCashedOut {
  type: 'BetCashedOut';
  betId: string;
  roundId: string;
  playerId: string;
  multiplier: Multiplier;
  payout: Money;
}

export type BetEvent = BetPlaced | BetCashedOut;

/** Emitido pelo serviço `settleBets`, não por um agregado (D35). */
export interface BetsSettled {
  type: 'BetsSettled';
  roundId: string;
  lostBetIds: string[];
}
