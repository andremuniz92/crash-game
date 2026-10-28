import type { RoundView } from '../domain/round-view.js';

/**
 * Leituras da rodada com FOR SHARE (D57). O RoundRepository do rounds
 * satisfaz esta interface por tipagem estrutural (D32, D56).
 */
export interface RoundReader {
  findCurrentForShare(): Promise<RoundView | null>;
  findByIdForShare(id: string): Promise<RoundView | null>;
}
