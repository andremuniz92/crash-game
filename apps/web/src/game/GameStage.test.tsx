import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithGame } from '../testing/render-game.js';
import { fakeResizeObserver } from '../testing/fake-browser.js';
import { GameStage } from './GameStage.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

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
});
