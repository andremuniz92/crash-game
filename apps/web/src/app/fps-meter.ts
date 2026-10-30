import type { RoundDto } from '@crash/shared';
import type { GameStore } from '../store/game-store.js';
import {
  createFpsStats,
  type FpsSnapshot,
  SLOW_FRAME_MS,
} from './fps-stats.js';
import type { FrameTimings } from './frame-loop.js';

const decimal = (value: number) => value.toFixed(1).replace('.', ',');

function panelText(snapshot: FpsSnapshot): string {
  return `${decimal(snapshot.averageFps)} fps · 1% low ${Math.round(snapshot.onePercentLowFps)} · lentos ${snapshot.slowFrames} (10 s)`;
}

/**
 * Medidor de fps ligado por ?fps (D97). Fora do React: o painel é um div no
 * body, escrito no máximo uma vez por segundo, nunca por frame. No fim de
 * cada rodada, uma linha no console com a média e os lentos da rodada
 * inteira, e o 1% low da janela de 10 s; a mesma linha fica no painel até o
 * fim da rodada seguinte, para ler no aparelho sem console remoto.
 */
export function startFpsMeter({
  frames,
  store,
  document,
  log = (line) => console.info(line),
}: {
  frames: FrameTimings;
  store: Pick<GameStore, 'getState' | 'subscribe'>;
  document: Document;
  log?: (line: string) => void;
}): () => void {
  const stats = createFpsStats();
  const panel = document.createElement('div');
  panel.dataset.fpsMeter = '';
  panel.setAttribute('aria-hidden', 'true');
  Object.assign(panel.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    zIndex: '1000',
    padding: '4px 8px',
    borderRadius: '6px',
    background: 'rgba(11, 26, 51, 0.85)',
    color: '#f4efe6',
    font: '12px ui-monospace, Menlo, Consolas, monospace',
    pointerEvents: 'none',
  });
  const windowLine = document.createElement('div');
  windowLine.dataset.fpsWindow = '';
  const roundLine = document.createElement('div');
  roundLine.dataset.fpsRound = '';
  panel.append(windowLine, roundLine);
  document.body.append(panel);

  // Contadores da rodada em andamento, zerados a cada nova RUNNING.
  let roundFrames = 0;
  let roundTime = 0;
  let roundSlow = 0;
  let nextWrite: number | null = null;

  let previous: RoundDto | null = store.getState().round;
  const unsubscribeStore = store.subscribe((state) => {
    const round = state.round;
    const before = previous;
    previous = round;
    const sameRound =
      before !== null && round !== null && before.id === round.id;
    if (
      round?.status === 'RUNNING' &&
      !(sameRound && before.status === 'RUNNING')
    ) {
      roundFrames = 0;
      roundTime = 0;
      roundSlow = 0;
    }
    if (
      round?.status === 'CRASHED' &&
      sameRound &&
      before.status === 'RUNNING'
    ) {
      const seconds = (round.crashedAt - round.startedAt) / 1_000;
      const average = roundTime > 0 ? (1_000 * roundFrames) / roundTime : 0;
      const low = Math.round(stats.snapshot().onePercentLowFps);
      const line = `[fps] rodada ${decimal(seconds)} s: média ${decimal(average)} · lentos ${roundSlow} · 1% low (últimos 10 s) ${low}`;
      log(line);
      roundLine.textContent = line;
    }
  });

  const unsubscribeTiming = frames.subscribeTiming((frameTime) => {
    const interval = stats.record(frameTime);
    if (interval !== null && store.getState().round?.status === 'RUNNING') {
      roundFrames++;
      roundTime += interval;
      if (interval > SLOW_FRAME_MS) roundSlow++;
    }
    if (nextWrite === null) {
      nextWrite = frameTime + 1_000;
      return;
    }
    if (frameTime < nextWrite) return;
    while (nextWrite <= frameTime) nextWrite += 1_000;
    windowLine.textContent = panelText(stats.snapshot());
  });

  return () => {
    unsubscribeTiming();
    unsubscribeStore();
    panel.remove();
  };
}
