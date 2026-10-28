import { describe, expect, it } from 'vitest';
import { fitScale, STAGE_HEIGHT, STAGE_WIDTH } from './fit-scale.js';

describe('fitScale (seção 11.2)', () => {
  it.each([
    [1280, 720, 1],
    [640, 360, 0.5],
    [1920, 1080, 1.5],
  ])('FS1: contêiner %i×%i → escala %f', (width, height, scale) => {
    expect(fitScale(width, height)).toBe(scale);
  });

  it('FS2: mantém a proporção pelo lado que limita', () => {
    expect(fitScale(1000, 1000)).toBe(0.78125);
    expect(fitScale(2000, 720)).toBe(1);
    // O palco escalado sempre cabe no contêiner.
    for (const [width, height] of [
      [1000, 1000],
      [2000, 720],
      [360, 640],
    ] as const) {
      const scale = fitScale(width, height);
      expect(STAGE_WIDTH * scale).toBeLessThanOrEqual(width);
      expect(STAGE_HEIGHT * scale).toBeLessThanOrEqual(height);
    }
  });

  it('FS3: contêiner oculto (0×0) dá escala 0, sem NaN', () => {
    expect(fitScale(0, 0)).toBe(0);
    expect(fitScale(0, 500)).toBe(0);
  });
});
