import { DomainError } from '../../shared/domain/domain-error.js';
import type { Round } from './round.js';

export class RoundNotFoundError extends DomainError {
  readonly code = 'ROUND_NOT_FOUND';
}

/**
 * Persistência das rodadas (D38). As leituras com lock seguem a ordem
 * rodada → aposta → carteira (D57) e exigem transação (D50).
 */
export interface RoundRepository {
  save(round: Round): Promise<void>;
  findById(id: string): Promise<Round | null>;
  /** A rodada que ainda não crashou (BETTING ou RUNNING); usada também na recuperação no boot. */
  findCurrent(): Promise<Round | null>;
  /** A última rodada crashada, para o `GET /rounds/current` entre rodadas (D63). */
  findLatestCrashed(): Promise<Round | null>;
  /** Rodada atual com `FOR SHARE`: apostas em andamento seguram o start (D57). */
  findCurrentForShare(): Promise<Round | null>;
  /** Rodada com `FOR SHARE`: cash outs em andamento seguram o crash (D57). */
  findByIdForShare(id: string): Promise<Round | null>;
  /** Rodada com `FOR UPDATE`, para start e crash (D57). Lança `RoundNotFoundError`. */
  getForUpdate(id: string): Promise<Round>;
}
