import {
  type BettingRoundDto,
  type CrashedRoundDto,
  type RoundDto,
  type RunningRoundDto,
  timeToCrash,
} from '@crash/shared';
import { describe, expect, it } from 'vitest';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../fit-scale.js';
import { displayMultiplier } from '../../store/display-multiplier.js';
import { ANCHOR, camera, projectX, projectY } from './camera.js';
import {
  CRASH_FALL_MS,
  createFrameModel,
  type FrameModel,
  type FrameOptions,
  REST,
  TRAIL_POINTS,
  writeFrame,
} from './frame-model.js';
import { PALETTE } from './palette.js';

const MOTION: FrameOptions = { reducedMotion: false };
const REDUCED: FrameOptions = { reducedMotion: true };

const ID = '00000000-0000-4000-8000-0000000000a1';
const STARTED_AT = 10_000;
const betting: BettingRoundDto = {
  status: 'BETTING',
  id: ID,
  seedHash: 'h'.repeat(64),
  bettingEndsAt: STARTED_AT,
};
const running: RunningRoundDto = {
  ...betting,
  status: 'RUNNING',
  startedAt: STARTED_AT,
};
/** O loop crasha um pouco depois do crashAt, como na vida real. */
const LOOP_DELAY_MS = 40;
function crashed(crashPoint: number): CrashedRoundDto {
  return {
    ...running,
    status: 'CRASHED',
    crashPoint,
    crashedAt: STARTED_AT + timeToCrash(crashPoint) + LOOP_DELAY_MS,
    serverSeed: 's'.repeat(64),
  };
}

const frame = (round: RoundDto | null, serverNow: number, options = MOTION) =>
  writeFrame(createFrameModel(), round, serverNow, options);

/** Os pontos que a cena desenha neste frame. */
function coordinates(model: FrameModel): Array<[number, number]> {
  const { kite, line, trail } = model;
  const points: Array<[number, number]> = [];
  if (kite.visible) points.push([kite.x, kite.y]);
  if (line.visible) {
    points.push(
      [line.fromX, line.fromY],
      [line.ctrlX, line.ctrlY],
      [line.toX, line.toY],
    );
  }
  for (let i = 0; i < trail.count; i++) {
    points.push([trail.points[2 * i] ?? NaN, trail.points[2 * i + 1] ?? NaN]);
  }
  return points;
}

/** Tudo finito e dentro do palco 1280×720. */
function expectSane(model: FrameModel) {
  expect(Number.isFinite(model.kite.rotation)).toBe(true);
  expect(Number.isFinite(model.kite.alpha)).toBe(true);
  for (const [x, y] of coordinates(model)) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(STAGE_WIDTH);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(STAGE_HEIGHT);
  }
}

describe('quadro da cena (D87, D88)', () => {
  it('SM1: sem rodada, nada aparece', () => {
    const model = frame(null, 0);
    expect(model.phase).toBe('NONE');
    expect(model.kite.visible).toBe(false);
    expect(model.line.visible).toBe(false);
    expect(model.trail.visible).toBe(false);
    expect(model).toEqual(createFrameModel());
  });

  it('SM2: em BETTING, a pipa balança pousada perto da âncora, presa pelo fio, sem rastro', () => {
    const model = frame(betting, 0);
    expect(model.kite.visible).toBe(true);
    expect(model.phase).toBe('BETTING');
    for (let now = 0; now <= 5_000; now += 100) {
      const { kite } = frame(betting, now);
      expect(Math.abs(kite.x - REST.x)).toBeLessThanOrEqual(6);
      expect(Math.abs(kite.y - REST.y)).toBeLessThanOrEqual(6);
      expect(Math.abs(kite.rotation)).toBeLessThanOrEqual(0.1);
    }
    const later = frame(betting, 600);
    expect([later.kite.y, later.kite.rotation]).not.toEqual([
      model.kite.y,
      model.kite.rotation,
    ]);
    expect(model.line).toMatchObject({
      visible: true,
      broken: false,
      fromX: ANCHOR.x,
      fromY: ANCHOR.y,
      toX: model.kite.x,
      toY: model.kite.y,
    });
    expect(model.trail.visible).toBe(false);
    expect(model.trail.count).toBe(0);
  });

  it('SM3: em BETTING com movimento reduzido, a pipa fica parada no repouso', () => {
    const first = frame(betting, 0, REDUCED);
    expect(first.kite.x).toBe(REST.x);
    expect(first.kite.y).toBe(REST.y);
    expect(first.kite.rotation).toBe(0);
    expect(frame(betting, 600, REDUCED)).toEqual(first);
  });

  it('SM4: em RUNNING, a pipa fica no multiplicador exibido e o rastro vai da âncora até ela', () => {
    const now = STARTED_AT + 20_000;
    const model = frame(running, now);
    expect(model.phase).toBe('RUNNING');

    const m = displayMultiplier(running, now) ?? NaN;
    const view = camera(20_000, m);
    expect(model.kite.visible).toBe(true);
    expect(model.kite.x).toBeCloseTo(projectX(view, 20_000), 9);
    expect(model.kite.y).toBeCloseTo(projectY(view, m), 9);

    const { trail } = model;
    expect(trail.visible).toBe(true);
    expect(trail.count).toBe(TRAIL_POINTS);
    expect(trail.points[0]).toBeCloseTo(ANCHOR.x, 3);
    expect(trail.points[1]).toBeCloseTo(ANCHOR.y, 3);
    expect(trail.points[2 * TRAIL_POINTS - 2]).toBeCloseTo(model.kite.x, 3);
    expect(trail.points[2 * TRAIL_POINTS - 1]).toBeCloseTo(model.kite.y, 3);

    expect(model.line).toMatchObject({
      visible: true,
      broken: false,
      fromX: ANCHOR.x,
      fromY: ANCHOR.y,
      toX: model.kite.x,
      toY: model.kite.y,
    });
  });

  it('SM5: com o relógio antes do startedAt, a pipa fica na âncora (1,00x), sem NaN', () => {
    const model = frame(running, STARTED_AT - 2_000);
    expect(model.kite.x).toBe(ANCHOR.x);
    expect(model.kite.y).toBe(ANCHOR.y);
    expectSane(model);
  });

  it('SM6a: dentro da janela mínima (1,30x), a pipa congela no crash point, não no relógio', () => {
    const round = crashed(130);
    const t = timeToCrash(130);
    const view = camera(t, 130);
    const x0 = projectX(view, t);
    const y0 = projectY(view, 130);
    const last = 2 * TRAIL_POINTS;

    for (const now of [round.crashedAt, round.crashedAt + 60_000]) {
      const model = frame(round, now);
      expect(model.phase).toBe('CRASHED');
      // A queda é vertical (D87): o x da pipa e o ponto em que o fio
      // rompeu (o último do rastro) não dependem do relógio.
      expect(model.kite.x).toBeCloseTo(x0, 9);
      expect(model.trail.points[last - 2]).toBeCloseTo(x0, 3);
      expect(model.trail.points[last - 1]).toBeCloseTo(y0, 3);
    }
    expect(frame(round, round.crashedAt).kite.y).toBeCloseTo(y0, 9);
  });

  it('SM6b: fora da janela mínima (2,35x), o rastro inteiro congela no crash point', () => {
    const round = crashed(235);
    const early = frame(round, round.crashedAt);
    const late = frame(round, round.crashedAt + 60_000);
    expect(early.phase).toBe('CRASHED');
    expect(late.trail.count).toBe(early.trail.count);
    expect(late.trail.points).toEqual(early.trail.points);
  });

  it('SM7: o fio se rompe, a pipa cai e some em 1,2 s, e depois o quadro fica parado', () => {
    const round = crashed(235);
    const start = frame(round, round.crashedAt);
    expect(start.line.broken).toBe(true);
    expect(start.kite.visible).toBe(true);
    expect(start.kite.alpha).toBe(1);

    const middle = frame(round, round.crashedAt + CRASH_FALL_MS / 2);
    expect(middle.kite.y).toBeGreaterThan(start.kite.y);
    expect(middle.kite.alpha).toBeGreaterThan(0);
    expect(middle.kite.alpha).toBeLessThan(1);
    expect(middle.kite.rotation).not.toBe(start.kite.rotation);

    const end = frame(round, round.crashedAt + CRASH_FALL_MS);
    expect(end.kite.alpha).toBe(0);
    expect(end.kite.visible).toBe(false);
    expect(frame(round, round.crashedAt + 5_000)).toEqual(end);
  });

  it('SM7b: com o relógio antes do crashedAt, a queda fica no começo, sem NaN', () => {
    const round = crashed(235);
    const early = frame(round, round.crashedAt - 500);
    expect(early.line.broken).toBe(true);
    expect(early).toEqual(frame(round, round.crashedAt));
    expectSane(early);
  });

  it('SM8: com movimento reduzido, o crash vai direto para o quadro final', () => {
    const round = crashed(235);
    const reduced = frame(round, round.crashedAt, REDUCED);
    expect(reduced.phase).toBe('CRASHED');
    expect(reduced).toEqual(frame(round, round.crashedAt + CRASH_FALL_MS));
  });

  it('SM9: um snapshot já crashado há tempo mostra o quadro final, sem animação', () => {
    const round = crashed(235);
    const late = frame(round, round.crashedAt + 60_000);
    expect(late.phase).toBe('CRASHED');
    expect(late).toEqual(frame(round, round.crashedAt + CRASH_FALL_MS));
  });

  it('SM10: cores calmas em BETTING e RUNNING; rastro e fio em perigo no crash', () => {
    for (const model of [
      frame(betting, 0),
      frame(running, STARTED_AT + 5_000),
    ]) {
      expect(model.kiteColor).toBe(PALETTE.amber);
      expect(model.trailColor).toBe(PALETTE.teal);
      expect(model.lineColor).toBe(PALETTE.text);
    }
    const round = crashed(235);
    const model = frame(round, round.crashedAt);
    expect(model.trailColor).toBe(PALETTE.danger);
    expect(model.lineColor).toBe(PALETTE.danger);
  });

  it('SM11: reaproveita o mesmo modelo e o mesmo buffer do rastro', () => {
    const out = createFrameModel();
    const points = out.trail.points;
    expect(writeFrame(out, running, STARTED_AT + 1_000, MOTION).phase).toBe(
      'RUNNING',
    );
    const round = crashed(235);
    const cases: Array<[RoundDto | null, number]> = [
      [null, 0],
      [betting, 0],
      [running, STARTED_AT + 3_000],
      [round, round.crashedAt + 300],
    ];
    for (let i = 0; i < 1_000; i++) {
      const [r, now] = cases[i % cases.length] ?? [null, 0];
      expect(writeFrame(out, r, now + i, MOTION)).toBe(out);
      expect(out.trail.points).toBe(points);
    }
  });

  it('SM12: números finitos e dentro do palco em toda a faixa da rodada', () => {
    for (let now = 0; now <= 5_000; now += 250) {
      expectSane(frame(betting, now));
    }
    for (let elapsed = 0; elapsed <= 230_000; elapsed += 500) {
      expectSane(frame(running, STARTED_AT + elapsed));
    }
    const points = [100, 101, 150, 235, 1_000, 10_000, 100_000, 1_000_000];
    for (const crashPoint of [...points, 10_000_000, 100_000_000]) {
      const round = crashed(crashPoint);
      for (const offset of [-500, 0, 300, 600, 1_200, 5_000]) {
        expectSane(frame(round, round.crashedAt + offset));
      }
    }
  });

  it('SM13: nada vaza entre fases no modelo reaproveitado', () => {
    const round = crashed(235);

    // CRASHED no meio da queda → BETTING
    const fromCrash = createFrameModel();
    writeFrame(fromCrash, round, round.crashedAt + CRASH_FALL_MS / 2, MOTION);
    expect(fromCrash.line.broken).toBe(true);
    expect(fromCrash.kite.alpha).toBeLessThan(1);
    expect(fromCrash.kite.rotation).not.toBe(0);
    writeFrame(fromCrash, betting, 600, MOTION);
    expect(fromCrash).toEqual(frame(betting, 600));

    // RUNNING com o rastro cheio → BETTING
    const fromRunning = createFrameModel();
    writeFrame(fromRunning, running, STARTED_AT + 20_000, MOTION);
    expect(fromRunning.trail.count).toBe(TRAIL_POINTS);
    writeFrame(fromRunning, betting, 600, MOTION);
    expect(fromRunning).toEqual(frame(betting, 600));

    // qualquer fase → sem rodada
    const phases: Array<[RoundDto, number]> = [
      [betting, 600],
      [running, STARTED_AT + 20_000],
      [round, round.crashedAt + CRASH_FALL_MS / 2],
      [round, round.crashedAt + 5_000],
    ];
    for (const [r, now] of phases) {
      const out = createFrameModel();
      writeFrame(out, r, now, MOTION);
      writeFrame(out, null, now, MOTION);
      expect(out).toEqual(createFrameModel());
    }
  });
});
