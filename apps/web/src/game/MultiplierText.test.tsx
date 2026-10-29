import type { CurrentRoundResponse, RoundDto } from '@crash/shared';
import { act } from '@testing-library/react';
import { Profiler, StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../store/game-store.js';
import { fakeFrames } from '../testing/fake-browser.js';
import { renderWithGame } from '../testing/render-game.js';
import { MultiplierText } from './MultiplierText.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ROUND = '00000000-0000-4000-8000-0000000000a1';
const running: RoundDto = {
  status: 'RUNNING',
  id: ROUND,
  seedHash: 'h'.repeat(64),
  bettingEndsAt: 0,
  startedAt: 0,
};
const crashed: RoundDto = {
  ...running,
  status: 'CRASHED',
  crashedAt: 20_000,
  crashPoint: 235,
  serverSeed: 's'.repeat(64),
};
const storeWith = (round: RoundDto | null) => {
  const store = createGameStore();
  const snapshot: CurrentRoundResponse = {
    round,
    bets: [],
    myBet: null,
    serverTime: 0,
  };
  store.load(snapshot);
  return store;
};

describe('MultiplierText', () => {
  it('MT1: cada frame escreve o multiplicador do relógio no textContent', () => {
    const frames = fakeFrames();
    const { container, setServerNow } = renderWithGame(<MultiplierText />, {
      store: storeWith(running),
    });
    expect(container.textContent).toBe('1,00x');

    setServerNow(11_553);
    frames.step();

    expect(container.textContent).toBe('2,00x');
  });

  it('MT2: os frames não re-renderizam o React', () => {
    const frames = fakeFrames();
    const commits = vi.fn();
    const { setServerNow } = renderWithGame(
      <Profiler id="multiplicador" onRender={commits}>
        <MultiplierText />
      </Profiler>,
      { store: storeWith(running) },
    );
    commits.mockClear();

    // Dentro de act: qualquer setState feito num frame é processado aqui.
    for (let ms = 1_000; ms <= 10_000; ms += 1_000) {
      setServerNow(ms);
      act(() => frames.step());
    }

    expect(commits).not.toHaveBeenCalled();
  });

  it('MT3: sem rodada, mostra "—"', () => {
    const frames = fakeFrames();
    const { container } = renderWithGame(<MultiplierText />, {
      store: storeWith(null),
    });
    frames.step();
    expect(container.textContent).toBe('—');
  });

  it('MT4: em CRASHED, mostra o crash point exato, mesmo com o relógio adiante', () => {
    const frames = fakeFrames();
    const { container, setServerNow } = renderWithGame(<MultiplierText />, {
      store: storeWith(crashed),
    });
    setServerNow(60_000);
    frames.step();
    expect(container.textContent).toBe('2,35x');
  });

  it('MT5: no StrictMode, um frame ativo montado e nenhum depois do unmount', () => {
    const frames = fakeFrames();
    const { unmount } = renderWithGame(
      <StrictMode>
        <MultiplierText />
      </StrictMode>,
      { store: storeWith(running) },
    );
    expect(frames.active()).toBe(1);
    frames.step(3);
    expect(frames.active()).toBe(1);

    unmount();

    expect(frames.active()).toBe(0);
  });

  it('MT6: fica fora da leitura de tela: aria-hidden e sem aria-live', () => {
    fakeFrames();
    const { container } = renderWithGame(<MultiplierText />, {
      store: storeWith(running),
    });
    const element = container.firstElementChild;
    expect(element?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});
