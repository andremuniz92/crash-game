import type { Bet } from './bet.js';

/** Persistência das apostas (D38). Implementação no M2. */
export interface BetRepository {
  save(bet: Bet): Promise<void>;
  /** Só devolve a aposta se ela for do jogador; senão a aplicação responde 404 (D33). */
  findByIdAndPlayer(betId: string, playerId: string): Promise<Bet | null>;
  /** Pré-checagem de "uma aposta por jogador por rodada" (D33). */
  findByRoundAndPlayer(roundId: string, playerId: string): Promise<Bet | null>;
  findByRound(roundId: string): Promise<Bet[]>;
  findPendingByRound(roundId: string): Promise<Bet[]>;
}
