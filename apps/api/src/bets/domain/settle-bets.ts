import { DomainError } from '../../shared/domain/domain-error.js';
import type { Bet } from './bet.js';
import type { BetsSettled } from './bet-events.js';
import type { RoundView } from './round-view.js';

export class RoundNotCrashedError extends DomainError {
  readonly code = 'ROUND_NOT_CRASHED';
}

/**
 * Serviço de domínio (D35): depois do crash, as apostas PENDING viram LOST.
 * As apostas que já fizeram cash out ficam como estão.
 */
export function settleBets(round: RoundView, bets: Bet[]): BetsSettled {
  if (round.status !== 'CRASHED') {
    throw new RoundNotCrashedError(
      'só dá para liquidar uma rodada que crashou',
    );
  }
  for (const bet of bets) bet.assertBelongsTo(round);

  const lost = bets.filter((bet) => bet.status === 'PENDING');
  for (const bet of lost) bet.lose();
  return {
    type: 'BetsSettled',
    roundId: round.id,
    lostBetIds: lost.map((bet) => bet.id),
  };
}
