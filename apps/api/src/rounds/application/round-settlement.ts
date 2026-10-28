import type { Round } from '../domain/round.js';

/** Resultado da liquidação, no formato do evento `BetsSettled` do bets (D35). */
export interface SettledBets {
  type: 'BetsSettled';
  roundId: string;
  lostBetIds: string[];
}

/**
 * Porta do rounds para liquidar as apostas de uma rodada crashada, na mesma
 * transação (D56). Implementada pelo bets/application.
 */
export interface RoundSettlement {
  settle(round: Round): Promise<SettledBets>;
}
