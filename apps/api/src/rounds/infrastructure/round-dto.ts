import type { RoundDto } from '@crash/shared';
import type { Round } from '../domain/round.js';

/**
 * Rodada → DTO público. Só a variante CRASHED recebe crashPoint e serverSeed,
 * e só pelos `reveal*`, que lançam antes do crash (D30, D63).
 */
export function toRoundDto(round: Round): RoundDto {
  const base = {
    id: round.id,
    seedHash: round.seedHash.toHex(),
    bettingEndsAt: round.bettingEndsAt,
  };
  switch (round.status) {
    case 'BETTING':
      return { ...base, status: 'BETTING' };
    case 'RUNNING':
      return {
        ...base,
        status: 'RUNNING',
        startedAt: required(round.startedAt),
      };
    case 'CRASHED':
      return {
        ...base,
        status: 'CRASHED',
        startedAt: required(round.startedAt),
        crashedAt: required(round.crashedAt),
        crashPoint: round.revealCrashPoint().x100,
        serverSeed: round.revealServerSeed().toHex(),
      };
  }
}

/** O `Round.restore` garante os instantes de cada status; null aqui é bug. */
function required(ms: number | null): number {
  if (ms === null) throw new Error('instante ausente para o status da rodada');
  return ms;
}
