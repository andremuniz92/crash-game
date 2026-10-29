import {
  MAX_MULTIPLIER_X100,
  multiplierAt,
  ONE_X,
  type RoundDto,
} from '@crash/shared';

/**
 * O multiplicador a exibir neste frame (D11, D75): sempre null ("—") ou um
 * inteiro seguro de 1,00x ao teto, que o `formatMultiplier` aceita. Tempo não
 * finito só nasce de bug, e então não se inventa número; tempo finito acima
 * do teto é crash atrasado, e o teto é o maior valor possível (D24).
 */
export function displayMultiplier(
  round: RoundDto | null,
  serverNow: number,
): number | null {
  if (round === null) return null;
  switch (round.status) {
    case 'BETTING':
      return ONE_X;
    case 'CRASHED':
      return round.crashPoint;
    case 'RUNNING': {
      const elapsed = serverNow - round.startedAt;
      if (!Number.isFinite(elapsed)) return null;
      return Math.min(multiplierAt(elapsed), MAX_MULTIPLIER_X100);
    }
  }
}
