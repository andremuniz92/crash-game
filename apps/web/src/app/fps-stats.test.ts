import { describe, expect, it } from 'vitest';
import { createFpsStats, type FpsStats } from './fps-stats.js';

/** Registra o primeiro frame em `start` e um frame ao fim de cada intervalo. */
function feed(stats: FpsStats, intervals: number[], start = 0): number {
  let time = start;
  stats.record(time);
  for (const interval of intervals) {
    time += interval;
    stats.record(time);
  }
  return time;
}
const repeat = (count: number, interval: number) =>
  Array.from({ length: count }, () => interval);

describe('estatísticas de fps (D97)', () => {
  it('FS1: a média é frames ÷ tempo, não a média dos fps de cada frame', () => {
    const steady = createFpsStats();
    feed(steady, repeat(60, 1_000 / 60));
    expect(steady.snapshot().averageFps).toBeCloseTo(60, 1);

    const mixed = createFpsStats();
    feed(mixed, [10, 20, 30, 40]);
    expect(mixed.snapshot().averageFps).toBe(40);
  });

  it('FS2: 1% low é 1000 ÷ a média dos tempos do pior 1%, não o percentil 99', () => {
    const hundred = createFpsStats();
    feed(hundred, [
      ...repeat(49, 1_000 / 60),
      50,
      ...repeat(49, 1_000 / 60),
      100,
    ]);
    // Pior 1% de 100 = 1 frame (100 ms) → 10 fps; o p99 seria o de 50 ms → 20.
    expect(hundred.snapshot().onePercentLowFps).toBeCloseTo(10, 6);

    const many = createFpsStats();
    feed(many, [...repeat(247, 16), 30, 40, 45]);
    // Pior 1% de 250 = ceil(2,5) = 3 frames: (30 + 40 + 45) / 3.
    expect(many.snapshot().onePercentLowFps).toBeCloseTo(1_000 / (115 / 3), 6);
  });

  it('FS3: lentos são os frames acima de 50 ms; exatamente 50 não conta', () => {
    const stats = createFpsStats();
    feed(stats, [...repeat(10, 16), 50, 50.01, 60]);
    expect(stats.snapshot().slowFrames).toBe(2);
  });

  it('FS4: as estatísticas cobrem só os últimos 10 s', () => {
    const stats = createFpsStats();
    feed(stats, [...repeat(50, 100), ...repeat(500, 20)]);
    expect(stats.snapshot()).toEqual({
      frames: 500,
      averageFps: 50,
      onePercentLowFps: 50,
      slowFrames: 0,
    });
  });

  it('FS5: com o buffer cheio, continua correto com as amostras mais recentes', () => {
    const stats = createFpsStats();
    // As amostras que saem do buffer (4 ms) são diferentes das últimas (2 ms):
    // um buffer que perdesse as recentes mostraria outra média.
    expect(() =>
      feed(stats, [...repeat(4_800, 4), ...repeat(600, 2)]),
    ).not.toThrow();
    const snapshot = stats.snapshot();
    // As 2.400 mais recentes: 1.800 de 4 ms e 600 de 2 ms (8,4 s, dentro da janela).
    expect(snapshot.frames).toBe(2_400);
    expect(snapshot.averageFps).toBeCloseTo(
      (2_400 * 1_000) / (1_800 * 4 + 600 * 2),
      6,
    );
  });

  it('FS6: o primeiro frame e intervalos acima de 1 s são descartados', () => {
    const stats = createFpsStats();
    expect(stats.record(0)).toBeNull();
    let time = 0;
    for (let i = 0; i < 60; i++) stats.record((time += 1_000 / 60));
    expect(stats.record((time += 8_000))).toBeNull();
    for (let i = 0; i < 60; i++) stats.record((time += 1_000 / 60));

    const snapshot = stats.snapshot();
    expect(snapshot.frames).toBe(120);
    expect(snapshot.averageFps).toBeCloseTo(60, 6);
    expect(snapshot.slowFrames).toBe(0);
    expect(snapshot.onePercentLowFps).toBeCloseTo(60, 6);
  });
});
