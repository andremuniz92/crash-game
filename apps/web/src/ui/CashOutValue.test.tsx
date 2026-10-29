import type { MyBetDto, RoundDto } from '@crash/shared';
import { act } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrameLoop } from '../app/frame-loop.js';
import { createGameStore } from '../store/game-store.js';
import { fakeFrames } from '../testing/fake-browser.js';
import { renderWithGame } from '../testing/render-game.js';
import { trackSubscriptions } from '../testing/track-subscriptions.js';
import { CashOutValue } from './CashOutValue.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const running: RoundDto = {
  status: 'RUNNING',
  id: '00000000-0000-4000-8000-0000000000a1',
  seedHash: 'h'.repeat(64),
  bettingEndsAt: 0,
  startedAt: 0,
};
const pending: MyBetDto = {
  betId: 'b0b0b0b0-0000-4000-8000-000000000001',
  amount: 1_000,
  status: 'PENDING',
  cashoutMultiplier: null,
  payout: null,
};
const storeWith = (round: RoundDto, myBet: MyBetDto | null) => {
  const store = createGameStore();
  store.load({ round, bets: [], myBet, serverTime: 0 });
  return store;
};

describe('CashOutValue', () => {
  it('PV1: mostra aposta × multiplicador do relógio, atualizado por frame', () => {
    const frames = fakeFrames();
    const { container, setServerNow } = renderWithGame(<CashOutValue />, {
      store: storeWith(running, pending),
    });
    expect(container.textContent).toBe(' 10,00');

    setServerNow(11_553); // 2,00x
    frames.step();

    expect(container.textContent).toBe(' 20,00');
  });

  it('PV2: os frames não re-renderizam o React', () => {
    const frames = fakeFrames();
    const commits = vi.fn();
    const { setServerNow } = renderWithGame(
      <Profiler id="valor" onRender={commits}>
        <CashOutValue />
      </Profiler>,
      { store: storeWith(running, pending) },
    );
    commits.mockClear();

    for (let ms = 1_000; ms <= 10_000; ms += 1_000) {
      setServerNow(ms);
      act(() => frames.step());
    }

    expect(commits).not.toHaveBeenCalled();
  });

  it('PV3: sem aposta PENDING em RUNNING, não mostra valor', () => {
    const frames = fakeFrames();
    const { container, store } = renderWithGame(<CashOutValue />, {
      store: storeWith(running, null),
    });
    frames.step();
    expect(container.textContent).toBe('');

    act(() =>
      store.receive({
        type: 'round:crashed',
        payload: {
          roundId: running.id,
          crashPoint: 150,
          serverSeed: 's'.repeat(64),
        },
        serverTime: 1,
      }),
    );
    frames.step();
    expect(container.textContent).toBe('');
  });

  it('PV3: no unmount, nenhum frame ativo; o valor fica fora do nome acessível', () => {
    const frames = fakeFrames();
    const { container, unmount } = renderWithGame(<CashOutValue />, {
      store: storeWith(running, pending),
    });
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(frames.active()).toBe(1);

    unmount();

    expect(frames.active()).toBe(0);
  });

  it('PV4: no StrictMode, uma assinatura no loop montado e nenhuma depois do unmount', () => {
    const frames = fakeFrames();
    const tracked = trackSubscriptions(
      createFrameLoop({ clock: { serverNow: () => 0 } }),
    );
    const { unmount } = renderWithGame(<CashOutValue />, {
      store: storeWith(running, pending),
      frames: tracked.loop,
      strict: true,
    });
    expect(tracked.live()).toBe(1);
    expect(frames.active()).toBe(1);

    unmount();

    expect(tracked.live()).toBe(0);
    expect(frames.active()).toBe(0);
  });
});
