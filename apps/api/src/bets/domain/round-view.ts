import type { Multiplier } from '../../shared/domain/multiplier.js';

/**
 * O que o contexto de apostas precisa saber da rodada (D32). O `Round` do
 * contexto `rounds` satisfaz esta interface por tipagem estrutural, sem que
 * `bets` importe o domínio de `rounds`.
 */
export interface RoundView {
  readonly id: string;
  readonly status: 'BETTING' | 'RUNNING' | 'CRASHED';
  acceptsBetsAt(now: number): boolean;
  acceptsCashOutAt(now: number): boolean;
  multiplierAt(now: number): Multiplier;
}
