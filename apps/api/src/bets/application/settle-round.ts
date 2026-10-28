import type { BetsSettled } from '../domain/bet-events.js';
import type { BetRepository } from '../domain/bet-repository.js';
import type { RoundView } from '../domain/round-view.js';
import { settleBets } from '../domain/settle-bets.js';

export interface SettleRoundTx {
  bets: BetRepository;
}

/**
 * Liquida as apostas pendentes de uma rodada crashada (D35), na transação de
 * quem chama. Quem chama segura a rodada com FOR UPDATE (D57), então nenhum
 * cash out muda as pendentes no meio do caminho.
 */
export async function settleRound(
  tx: SettleRoundTx,
  round: RoundView,
): Promise<BetsSettled> {
  const pending = await tx.bets.findPendingByRound(round.id);
  const settled = settleBets(round, pending);
  for (const bet of pending) await tx.bets.save(bet);
  return settled;
}
