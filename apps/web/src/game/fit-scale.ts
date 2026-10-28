/** Resolução lógica fixa do palco (seção 11.2). */
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;

/**
 * Escala que faz o palco de 1280×720 caber no contêiner mantendo a
 * proporção: o lado que limita decide. Contêiner oculto dá 0.
 */
export function fitScale(width: number, height: number): number {
  return Math.max(0, Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT));
}
