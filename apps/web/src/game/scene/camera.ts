/** Área útil do palco 1280×720 onde a curva e a pipa se movem (D87). */
export const PLOT = { left: 80, top: 80, right: 1200, bottom: 640 } as const;

/** A "mão" que segura o fio: canto inferior esquerdo da área útil. */
export const ANCHOR = { x: PLOT.left, y: PLOT.bottom } as const;

const WIDTH = PLOT.right - PLOT.left;
const HEIGHT = PLOT.bottom - PLOT.top;

/** Janela mínima: 8 s e 2,00x, para a curva não começar colada nos eixos. */
const MIN_X_MS = 8_000;
const MIN_Y_X100 = 200;
/** Fração da área útil que a pipa pode ocupar antes de a janela crescer. */
const X_REACH = 0.8;
const Y_REACH = 0.75;

/** Quanto do tempo e do multiplicador cabe na área útil. */
export interface CameraView {
  xMaxMs: number;
  yMaxX100: number;
}

/**
 * Janela visível para a pipa em (elapsed, multiplicador): eixos lineares que
 * crescem junto com ela, sem deixá-la passar de 80% × 75% da área útil
 * (D87). `out` deixa o chamador reaproveitar o objeto a cada frame (D95).
 */
export function camera(
  elapsedMs: number,
  multiplierX100: number,
  out: CameraView = { xMaxMs: 0, yMaxX100: 0 },
): CameraView {
  out.xMaxMs = Math.max(MIN_X_MS, Math.max(elapsedMs, 0) / X_REACH);
  out.yMaxX100 = Math.max(MIN_Y_X100, 100 + (multiplierX100 - 100) / Y_REACH);
  return out;
}

/** Coordenada x no palco de um instante da rodada. */
export function projectX(view: CameraView, elapsedMs: number): number {
  return PLOT.left + (Math.max(elapsedMs, 0) / view.xMaxMs) * WIDTH;
}

/** Coordenada y no palco de um multiplicador ×100 (1,00x na base). */
export function projectY(view: CameraView, multiplierX100: number): number {
  return (
    PLOT.bottom - ((multiplierX100 - 100) / (view.yMaxX100 - 100)) * HEIGHT
  );
}
