import {
  MAX_MULTIPLIER_X100,
  multiplierAt,
  ONE_X,
  type RoundDto,
  timeToCrash,
} from '@crash/shared';
import { displayMultiplier } from '../../store/display-multiplier.js';
import {
  ANCHOR,
  camera,
  type CameraView,
  PLOT,
  projectX,
  projectY,
} from './camera.js';
import { PALETTE } from './palette.js';

/** Pontos do rastro da curva (D88). */
export const TRAIL_POINTS = 48;
/** Duração da queda da pipa depois do crash (D87). */
export const CRASH_FALL_MS = 1_200;
/** Onde a pipa fica pousada durante as apostas, perto da âncora. */
export const REST = { x: 140, y: 580 } as const;

export type ScenePhase = 'NONE' | RoundDto['status'];

/** Tudo o que o adaptador do Pixi precisa para desenhar um frame (D88). */
export interface FrameModel {
  phase: ScenePhase;
  kite: {
    visible: boolean;
    x: number;
    y: number;
    rotation: number;
    alpha: number;
  };
  line: {
    visible: boolean;
    broken: boolean;
    fromX: number;
    fromY: number;
    ctrlX: number;
    ctrlY: number;
    toX: number;
    toY: number;
  };
  /** `points` guarda x e y alternados; só os `count` primeiros pares valem. */
  trail: { visible: boolean; count: number; points: Float32Array };
  kiteColor: number;
  lineColor: number;
  trailColor: number;
}

export interface FrameOptions {
  reducedMotion: boolean;
}

/** O modelo é alocado uma vez, na montagem da cena, e reaproveitado (D95). */
export function createFrameModel(): FrameModel {
  return {
    phase: 'NONE',
    kite: { visible: false, x: 0, y: 0, rotation: 0, alpha: 1 },
    line: {
      visible: false,
      broken: false,
      fromX: 0,
      fromY: 0,
      ctrlX: 0,
      ctrlY: 0,
      toX: 0,
      toY: 0,
    },
    trail: {
      visible: false,
      count: 0,
      points: new Float32Array(TRAIL_POINTS * 2),
    },
    kiteColor: PALETTE.amber,
    lineColor: PALETTE.text,
    trailColor: PALETTE.teal,
  };
}

/** Inclinação da pipa no ar, puxada pelo fio. */
const FLYING_TILT = -0.12;
/** Balanço em BETTING: ±4 px e ±0,08 rad, num ciclo de 2,4 s. */
const SWAY_PERIOD_MS = 2_400;
const SWAY_PX = 4;
const SWAY_RAD = 0.08;
/** Quanto o fio cede no meio, em fração do comprimento. */
const SAG = 0.12;
/** Voltas da pipa na queda. */
const FALL_TURNS = 1.5;

/** Janela de câmera reaproveitada a cada frame (D95). */
const view: CameraView = { xMaxMs: 0, yMaxX100: 0 };

/**
 * Escreve em `out` o quadro da rodada no instante `serverNow` (D87, D88).
 * Função pura do estado e do relógio: começa sempre do estado inicial, então
 * nada de uma fase vaza para a próxima no modelo reaproveitado.
 */
export function writeFrame(
  out: FrameModel,
  round: RoundDto | null,
  serverNow: number,
  { reducedMotion }: FrameOptions,
): FrameModel {
  reset(out);
  if (round === null) return out;
  out.phase = round.status;
  switch (round.status) {
    case 'BETTING':
      writeBetting(out, serverNow, reducedMotion);
      break;
    case 'RUNNING': {
      const elapsed = serverNow - round.startedAt;
      const m = displayMultiplier(round, serverNow) ?? ONE_X;
      writeFlight(out, elapsed, m);
      break;
    }
    case 'CRASHED': {
      // Congela no crash point, nunca no relógio (D87, D68).
      writeFlight(out, timeToCrash(round.crashPoint), round.crashPoint);
      const progress = reducedMotion
        ? 1
        : Math.min(
            Math.max((serverNow - round.crashedAt) / CRASH_FALL_MS, 0),
            1,
          );
      writeFall(out, progress);
      break;
    }
  }
  return out;
}

function reset(out: FrameModel): void {
  out.phase = 'NONE';
  const { kite, line, trail } = out;
  kite.visible = false;
  kite.x = 0;
  kite.y = 0;
  kite.rotation = 0;
  kite.alpha = 1;
  line.visible = false;
  line.broken = false;
  setLine(out, 0, 0, 0, 0);
  trail.visible = false;
  trail.count = 0;
  trail.points.fill(0);
  out.kiteColor = PALETTE.amber;
  out.lineColor = PALETTE.text;
  out.trailColor = PALETTE.teal;
}

function writeBetting(out: FrameModel, serverNow: number, still: boolean) {
  const angle = (2 * Math.PI * serverNow) / SWAY_PERIOD_MS;
  const { kite } = out;
  kite.visible = true;
  kite.x = REST.x;
  kite.y = still ? REST.y : REST.y + SWAY_PX * Math.sin(angle);
  kite.rotation = still ? 0 : SWAY_RAD * Math.sin(angle + 1);
  holdLine(out);
}

/** Pipa em voo no ponto (elapsed, m), com o rastro desde t = 0. */
function writeFlight(out: FrameModel, elapsed: number, m: number) {
  // Tempo negativo vale 0 na câmera e na projeção (1,00x na âncora).
  camera(elapsed, m, view);
  const { kite, trail } = out;
  kite.visible = true;
  kite.x = projectX(view, elapsed);
  kite.y = projectY(view, m);
  kite.rotation = FLYING_TILT;

  trail.visible = true;
  trail.count = TRAIL_POINTS;
  const last = TRAIL_POINTS - 1;
  for (let i = 0; i <= last; i++) {
    const t = (elapsed * i) / last;
    // O último ponto é a própria pipa, mesmo com o teto aplicado.
    const mi = i === last ? m : Math.min(multiplierAt(t), MAX_MULTIPLIER_X100);
    trail.points[2 * i] = projectX(view, t);
    trail.points[2 * i + 1] = projectY(view, mi);
  }
  holdLine(out);
}

/** Queda depois do crash: `progress` de 0 (rompeu agora) a 1 (sumiu). */
function writeFall(out: FrameModel, progress: number) {
  const { kite, line } = out;
  const x0 = kite.x;
  const y0 = kite.y;
  kite.y = y0 + (PLOT.bottom - y0) * progress * progress;
  kite.rotation = FLYING_TILT + 2 * Math.PI * FALL_TURNS * progress;
  kite.alpha = 1 - progress;
  kite.visible = kite.alpha > 0;
  // O fio rompido recolhe da pipa até a âncora.
  line.broken = true;
  setLine(
    out,
    ANCHOR.x,
    ANCHOR.y,
    x0 + (ANCHOR.x - x0) * progress,
    y0 + (ANCHOR.y - y0) * progress,
  );
  line.visible = progress < 1;
  out.lineColor = PALETTE.danger;
  out.trailColor = PALETTE.danger;
}

/** Fio esticado da âncora até a pipa. */
function holdLine(out: FrameModel) {
  out.line.visible = true;
  setLine(out, ANCHOR.x, ANCHOR.y, out.kite.x, out.kite.y);
}

/** Fio de (fromX, fromY) a (toX, toY), cedendo no meio sem passar do chão. */
function setLine(
  out: FrameModel,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  const { line } = out;
  line.fromX = fromX;
  line.fromY = fromY;
  line.toX = toX;
  line.toY = toY;
  const length = Math.hypot(toX - fromX, toY - fromY);
  line.ctrlX = (fromX + toX) / 2;
  line.ctrlY = Math.min((fromY + toY) / 2 + SAG * length, PLOT.bottom);
}
