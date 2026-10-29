import type { CurrentRoundResponse, RoundDto } from '@crash/shared';
import { act } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFrameLoop,
  type FrameListener,
  type FrameLoop,
} from '../app/frame-loop.js';
import { createGameStore } from '../store/game-store.js';
import { fakeFrames } from '../testing/fake-browser.js';
import { renderWithGame } from '../testing/render-game.js';
import { trackSubscriptions } from '../testing/track-subscriptions.js';
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

  it('MT5: no StrictMode, uma assinatura no loop montado e nenhuma depois do unmount', () => {
    const frames = fakeFrames();
    const tracked = trackSubscriptions(
      createFrameLoop({ clock: { serverNow: () => 0 } }),
    );
    const { unmount } = renderWithGame(<MultiplierText />, {
      store: storeWith(running),
      frames: tracked.loop,
      strict: true,
    });
    // Montou, desmontou e montou: só a segunda montagem segue assinada.
    expect(tracked.live()).toBe(1);
    expect(frames.active()).toBe(1);
    frames.step(3);
    expect(tracked.live()).toBe(1);

    unmount();

    expect(tracked.live()).toBe(0);
    expect(frames.active()).toBe(0);
  });

  it('MT7: escreve o valor entregue pelo loop, não uma leitura própria do relógio', () => {
    let emit: FrameListener = () => {};
    const frames: FrameLoop = {
      subscribe(listener) {
        emit = listener;
        return () => {};
      },
    };
    const { container } = renderWithGame(<MultiplierText />, {
      store: storeWith(running),
      frames,
      serverNow: 0,
    });

    emit(11_553);

    expect(container.textContent).toBe('2,00x');
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
