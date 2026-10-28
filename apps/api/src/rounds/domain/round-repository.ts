import type { Round } from './round.js';

/** Persistência das rodadas (D38). Implementação no M2. */
export interface RoundRepository {
  save(round: Round): Promise<void>;
  findById(id: string): Promise<Round | null>;
  /** A rodada que ainda não crashou (BETTING ou RUNNING); usada também na recuperação no boot. */
  findCurrent(): Promise<Round | null>;
}
