import { Profiler, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithGame } from '../testing/render-game.js';
import { fakeResizeObserver } from '../testing/fake-browser.js';
import { GameStage } from './GameStage.js';
import { type StageScale, useStageScale } from './stage-scale.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Filho do palco que entrega ao teste o sinal de escala publicado. */
function Probe({ onScale }: { onScale: (scale: StageScale) => void }) {
  const scale = useStageScale();
  useEffect(() => {
    onScale(scale);
  }, [scale, onScale]);
  return null;
}

const stageOf = (container: HTMLElement) => {
  const stage = container.querySelector<HTMLElement>('[data-stage]');
  if (!stage) throw new Error('palco não encontrado');
  return stage;
};

describe('GameStage (seção 11.2)', () => {
  it('ST1: o palco tem 1280×720 e a medida do contêiner aplica a escala', () => {
    const observers = fakeResizeObserver();
    const { container } = renderWithGame(<GameStage />);
    const stage = stageOf(container);

    expect(stage.style.width).toBe('1280px');
    expect(stage.style.height).toBe('720px');
    observers.last().resize(640, 360);
    expect(stage.style.transform).toBe('scale(0.5)');
  });

  it('ST2: uma nova medida atualiza a escala', () => {
    const observers = fakeResizeObserver();
    const { container } = renderWithGame(<GameStage />);

    observers.last().resize(640, 360);
    observers.last().resize(1000, 1000);

    expect(stageOf(container).style.transform).toBe('scale(0.78125)');
  });

  it('ST3: o observer é desconectado no unmount', () => {
    const observers = fakeResizeObserver();
    const { unmount } = renderWithGame(<GameStage />);
    const observer = observers.last();
    expect(observer.disconnected).toBe(false);

    unmount();

    expect(observer.disconnected).toBe(true);
  });

  it('ST4: cada medida publica a mesma escala do transform, sem re-render', () => {
    const observers = fakeResizeObserver();
    let scale: StageScale | null = null;
    const commits = vi.fn();
    const { container } = renderWithGame(
      <Profiler id="palco" onRender={commits}>
        <GameStage>
          <Probe onScale={(value) => (scale = value)} />
        </GameStage>
      </Profiler>,
    );
    if (!scale) throw new Error('sinal de escala não publicado');
    const signal: StageScale = scale;
    const listener = vi.fn();
    signal.subscribe(listener);
    commits.mockClear();

    observers.last().resize(640, 360);
    expect(stageOf(container).style.transform).toBe('scale(0.5)');
    expect(signal.get()).toBe(0.5);
    observers.last().resize(1000, 1000);
    expect(stageOf(container).style.transform).toBe('scale(0.78125)');
    expect(signal.get()).toBe(0.78125);

    expect(listener.mock.calls).toEqual([[0.5], [0.78125]]);
    expect(commits).not.toHaveBeenCalled();
  });

  it('ST5: depois do unsubscribe, o assinante não é mais avisado', () => {
    const observers = fakeResizeObserver();
    let scale: StageScale | null = null;
    renderWithGame(
      <GameStage>
        <Probe onScale={(value) => (scale = value)} />
      </GameStage>,
    );
    if (!scale) throw new Error('sinal de escala não publicado');
    const signal: StageScale = scale;
    const listener = vi.fn();
    const unsubscribe = signal.subscribe(listener);

    observers.last().resize(640, 360);
    unsubscribe();
    observers.last().resize(1000, 1000);

    expect(listener.mock.calls).toEqual([[0.5]]);
  });
});
