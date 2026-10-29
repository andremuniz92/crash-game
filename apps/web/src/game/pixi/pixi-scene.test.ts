import {
  type BettingRoundDto,
  type CrashedRoundDto,
  type RoundDto,
  type RunningRoundDto,
  timeToCrash,
} from '@crash/shared';
import { Graphics, type GraphicsContext } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  CRASH_FALL_MS,
  createFrameModel,
  type FrameModel,
  writeFrame,
} from '../scene/frame-model.js';
import {
  buildScene,
  LINE_WIDTH,
  type PixiScene,
  TRAIL_WIDTH,
} from './pixi-scene.js';

const STARTED_AT = 10_000;
const betting: BettingRoundDto = {
  status: 'BETTING',
  id: '00000000-0000-4000-8000-0000000000a1',
  seedHash: 'h'.repeat(64),
  bettingEndsAt: STARTED_AT,
};
const running: RunningRoundDto = {
  ...betting,
  status: 'RUNNING',
  startedAt: STARTED_AT,
};
const crashed: CrashedRoundDto = {
  ...running,
  status: 'CRASHED',
  crashPoint: 235,
  crashedAt: STARTED_AT + timeToCrash(235) + 40,
  serverSeed: 's'.repeat(64),
};
const nextBetting: BettingRoundDto = {
  ...betting,
  id: '00000000-0000-4000-8000-0000000000a2',
  bettingEndsAt: crashed.crashedAt + 13_000,
};

const model = (round: RoundDto | null, serverNow: number): FrameModel =>
  writeFrame(createFrameModel(), round, serverNow, { reducedMotion: false });

const part = (scene: PixiScene, label: 'trail' | 'line' | 'kite') => {
  const child = scene.stage.getChildByLabel(label);
  if (!(child instanceof Graphics)) throw new Error(`sem o Graphics ${label}`);
  return child;
};

/** Cópia dos limites, para comparar dois instantes. */
const box = (graphics: Graphics) => {
  const { minX, minY, maxX, maxY } = graphics.bounds;
  return { minX, minY, maxX, maxY };
};

/** Caixa dos pontos do modelo, alargada pela espessura do traço. */
function expectCovers(
  graphics: Graphics,
  points: Array<[number, number]>,
  width: number,
) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const { minX, minY, maxX, maxY } = box(graphics);
  // Bounds vazio no Pixi 8 vale 0, não Infinity: sem geometria, a caixa
  // poderia passar por acaso se incluísse a origem.
  expect(maxX - minX).toBeGreaterThan(0);
  expect(maxY - minY).toBeGreaterThan(0);
  expect(minX).toBeLessThanOrEqual(Math.min(...xs));
  expect(minX).toBeGreaterThanOrEqual(Math.min(...xs) - width);
  expect(maxX).toBeGreaterThanOrEqual(Math.max(...xs));
  expect(maxX).toBeLessThanOrEqual(Math.max(...xs) + width);
  expect(minY).toBeLessThanOrEqual(Math.min(...ys));
  expect(minY).toBeGreaterThanOrEqual(Math.min(...ys) - width);
  expect(maxY).toBeGreaterThanOrEqual(Math.max(...ys));
  expect(maxY).toBeLessThanOrEqual(Math.max(...ys) + width);
}

const trailPoints = (m: FrameModel): Array<[number, number]> =>
  Array.from({ length: m.trail.count }, (_, i) => [
    m.trail.points[2 * i] ?? NaN,
    m.trail.points[2 * i + 1] ?? NaN,
  ]);
const linePoints = (m: FrameModel): Array<[number, number]> => [
  [m.line.fromX, m.line.fromY],
  [m.line.ctrlX, m.line.ctrlY],
  [m.line.toX, m.line.toY],
];

describe('adaptador Pixi da cena (D88, D95)', () => {
  it('PA1: a árvore é rastro, fio e pipa, e a pipa já nasce desenhada', () => {
    const scene = buildScene();
    expect(scene.stage.children.map((c) => c.label)).toEqual([
      'trail',
      'line',
      'kite',
    ]);
    for (const child of scene.stage.children) {
      expect(child).toBeInstanceOf(Graphics);
    }
    const kite = box(part(scene, 'kite'));
    expect(kite.maxX - kite.minX).toBeGreaterThan(0);
    expect(kite.maxY - kite.minY).toBeGreaterThan(0);
    // Sem geometria, o Pixi 8 dá bounds 0,0,0,0, e isEmpty() devolve false
    // (só considera vazio minX > maxX): mede-se largura e altura.
    for (const label of ['trail', 'line'] as const) {
      const { minX, minY, maxX, maxY } = box(part(scene, label));
      expect({ label, width: maxX - minX, height: maxY - minY }).toEqual({
        label,
        width: 0,
        height: 0,
      });
    }
  });

  it('PA2: o draw aplica a pose da pipa, desenha o rastro e esconde pipa e fio no fim do crash', () => {
    const scene = buildScene();
    const flying = model(running, STARTED_AT + 20_000);
    scene.draw(flying);

    const kite = part(scene, 'kite');
    expect(kite.x).toBe(flying.kite.x);
    expect(kite.y).toBe(flying.kite.y);
    expect(kite.rotation).toBe(flying.kite.rotation);
    expect(kite.alpha).toBe(flying.kite.alpha);
    expect(kite.visible).toBe(true);
    expect(kite.tint).toBe(flying.kiteColor);
    expectCovers(part(scene, 'trail'), trailPoints(flying), TRAIL_WIDTH);
    expect(part(scene, 'line').visible).toBe(true);

    const falling = model(crashed, crashed.crashedAt + CRASH_FALL_MS / 2);
    scene.draw(falling);
    expect(kite.rotation).toBe(falling.kite.rotation);
    expect(kite.alpha).toBe(falling.kite.alpha);

    scene.draw(model(crashed, crashed.crashedAt + CRASH_FALL_MS));
    expect(kite.visible).toBe(false);
    expect(part(scene, 'line').visible).toBe(false);
  });

  it('PA3: uma rodada inteira em 600 frames não cria nem troca objetos', () => {
    const scene = buildScene();
    const children = [...scene.stage.children];
    const parts = ['trail', 'line', 'kite'] as const;
    const contexts = parts.map((label) => part(scene, label).context);
    const kiteInstructions = part(scene, 'kite').context.instructions.length;

    for (let i = 0; i < 600; i++) {
      const frame =
        i < 100
          ? model(betting, i * 100)
          : i < 400
            ? model(running, STARTED_AT + (i - 100) * 100)
            : i < 500
              ? model(crashed, crashed.crashedAt + (i - 400) * 20)
              : model(nextBetting, crashed.crashedAt + 3_000 + i * 10);
      scene.draw(frame);
      expect(
        part(scene, 'trail').context.instructions.length,
      ).toBeLessThanOrEqual(1);
      expect(
        part(scene, 'line').context.instructions.length,
      ).toBeLessThanOrEqual(1);
    }

    expect(scene.stage.children).toHaveLength(3);
    scene.stage.children.forEach((child, i) => expect(child).toBe(children[i]));
    parts.forEach((label, i) =>
      expect(part(scene, label).context).toBe(contexts[i]),
    );
    expect(part(scene, 'kite').context.instructions.length).toBe(
      kiteInstructions,
    );
  });

  it('PA4: destroy destrói o palco, os três filhos e os três contexts', () => {
    const scene = buildScene();
    scene.draw(model(running, STARTED_AT + 5_000));
    const children = [...scene.stage.children];
    const contexts: GraphicsContext[] = (
      ['trail', 'line', 'kite'] as const
    ).map((label) => part(scene, label).context);

    scene.destroy();

    expect(scene.stage.destroyed).toBe(true);
    expect(children.map((c) => c.destroyed)).toEqual([true, true, true]);
    expect(contexts.map((c) => c.destroyed)).toEqual([true, true, true]);
  });

  it('PA5: o que não aparece fica invisível, mas continua na árvore', () => {
    const scene = buildScene();
    const { stage } = scene;
    const trail = part(scene, 'trail');
    const line = part(scene, 'line');
    const kite = part(scene, 'kite');

    scene.draw(model(betting, 0));
    expect(trail.visible).toBe(false);
    expect(trail.parent).toBe(stage);

    scene.draw(model(null, 0));
    for (const graphics of [trail, line, kite]) {
      expect(graphics.visible).toBe(false);
      expect(graphics.parent).toBe(stage);
    }

    scene.draw(model(crashed, crashed.crashedAt + CRASH_FALL_MS));
    expect(line.visible).toBe(false);
    expect(line.parent).toBe(stage);
  });

  it('PA6: rastro e fio são redesenhados a cada frame, seguindo o modelo', () => {
    const scene = buildScene();
    const trail = part(scene, 'trail');
    const line = part(scene, 'line');

    scene.draw(model(running, STARTED_AT + 5_000));
    const trailBefore = box(trail);
    const lineBefore = box(line);

    const later = model(running, STARTED_AT + 20_000);
    scene.draw(later);

    expectCovers(trail, trailPoints(later), TRAIL_WIDTH);
    expectCovers(line, linePoints(later), LINE_WIDTH);
    expect(box(trail)).not.toEqual(trailBefore);
    expect(box(line)).not.toEqual(lineBefore);
  });
});
