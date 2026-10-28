import { DomainError } from '../../shared/domain/domain-error.js';
import type { Bet } from './bet.js';

/** Segunda aposta do jogador na mesma rodada, barrada pelo banco (D33, D52). */
export class BetAlreadyPlacedError extends DomainError {
  readonly code = 'BET_ALREADY_PLACED';
}

/** Persistência das apostas (D38). Implementação no M2. */
export interface BetRepository {
  save(bet: Bet): Promise<void>;
  /**
   * Carrega com lock pessimista (`SELECT ... FOR UPDATE`, seção 10.2, D45).
   * Só devolve a aposta se ela for do jogador; senão a aplicação responde 404 (D33).
   */
  getByIdAndPlayerForUpdate(
    betId: string,
    playerId: string,
  ): Promise<Bet | null>;
  /** Pré-checagem de "uma aposta por jogador por rodada" (D33). */
  findByRoundAndPlayer(roundId: string, playerId: string): Promise<Bet | null>;
  findByRound(roundId: string): Promise<Bet[]>;
  findPendingByRound(roundId: string): Promise<Bet[]>;
}
