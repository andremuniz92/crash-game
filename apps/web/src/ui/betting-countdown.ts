import type { RoundDto } from '@crash/shared';

/** O prazo da janela de apostas, se ela ainda está aberta neste instante. */
function openDeadline(
  round: RoundDto | null,
  serverNow: number,
): number | null {
  return round?.status === 'BETTING' && serverNow < round.bettingEndsAt
    ? round.bettingEndsAt
    : null;
}

/**
 * A janela de apostas está aberta pelo relógio do servidor (D74). O botão
 * Apostar e o contador usam a mesma regra, então fecham no mesmo instante.
 */
export function bettingOpenAt(
  round: RoundDto | null,
  serverNow: number,
): boolean {
  return openDeadline(round, serverNow) !== null;
}

/**
 * Segundos restantes para apostar, arredondados para cima (D100): 0,2 s
 * mostra 1. Null fora de BETTING ou com o prazo vencido, nunca 0.
 */
export function secondsLeft(
  round: RoundDto | null,
  serverNow: number,
): number | null {
  const deadline = openDeadline(round, serverNow);
  return deadline === null ? null : Math.ceil((deadline - serverNow) / 1_000);
}
