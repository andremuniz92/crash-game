import { MAX_MULTIPLIER_X100, multiplierAt } from '@crash/shared';
import { describe, expect, it } from 'vitest';
import { ANCHOR, camera, PLOT, projectX, projectY } from './camera.js';

const WIDTH = PLOT.right - PLOT.left;
const HEIGHT = PLOT.bottom - PLOT.top;
/** Limites da pipa dentro da área útil (D87): 80% da largura, 75% da altura. */
const MAX_X = PLOT.left + 0.8 * WIDTH;
const MIN_Y = PLOT.bottom - 0.75 * HEIGHT;

/** Uma rodada sem crash de 0 a 230 s (~teto, D24), a cada 500 ms. */
const SAMPLES = Array.from({ length: 461 }, (_, i) => {
  const elapsed = i * 500;
  return {
    elapsed,
    m: Math.min(multiplierAt(elapsed), MAX_MULTIPLIER_X100),
  };
});

describe('câmera da cena (D87)', () => {
  it('CA1: janela mínima de 8 s e 2,00x no início, e tempo negativo vale 0', () => {
    expect(camera(0, 100)).toEqual({ xMaxMs: 8_000, yMaxX100: 200 });
    expect(camera(-2_000, 100)).toEqual({ xMaxMs: 8_000, yMaxX100: 200 });
  });

  it('CA2: a pipa fica dentro de 80% × 75% da área útil e chega a esses limites', () => {
    for (const { elapsed, m } of SAMPLES) {
      const view = camera(elapsed, m);
      expect(projectX(view, elapsed)).toBeLessThanOrEqual(MAX_X + 1e-9);
      expect(projectY(view, m)).toBeGreaterThanOrEqual(MIN_Y - 1e-9);
    }
    // Aos 20 s (3,32x), as duas janelas já passaram dos mínimos.
    const m = multiplierAt(20_000);
    const view = camera(20_000, m);
    expect(projectX(view, 20_000)).toBeCloseTo(MAX_X, 6);
    expect(projectY(view, m)).toBeCloseTo(MIN_Y, 6);
  });

  it('CA3: a janela nunca diminui ao longo da rodada', () => {
    let previous = camera(0, 100);
    for (const { elapsed, m } of SAMPLES) {
      const view = camera(elapsed, m);
      expect(view.xMaxMs).toBeGreaterThanOrEqual(previous.xMaxMs);
      expect(view.yMaxX100).toBeGreaterThanOrEqual(previous.yMaxX100);
      previous = view;
    }
  });

  it('CA4: (0, 1,00x) cai na âncora e (xMax, yMax) no canto superior direito', () => {
    const view = camera(10_000, 300);
    expect(projectX(view, 0)).toBe(ANCHOR.x);
    expect(projectY(view, 100)).toBe(ANCHOR.y);
    expect(projectX(view, view.xMaxMs)).toBeCloseTo(PLOT.right, 9);
    expect(projectY(view, view.yMaxX100)).toBeCloseTo(PLOT.top, 9);
  });
});
