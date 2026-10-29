import type { RoundDto } from '@crash/shared';
import { act, fireEvent, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFrameLoop,
  type FrameListener,
  type FrameLoop,
} from '../app/frame-loop.js';
import { signIn } from '../store/game-state.js';
import { createGameStore } from '../store/game-store.js';
import { fakeFrames } from '../testing/fake-browser.js';
import { renderWithGame } from '../testing/render-game.js';
import { trackSubscriptions } from '../testing/track-subscriptions.js';
import { BetPanel } from './BetPanel.js';
import { BettingCountdown } from './BettingCountdown.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ID = '00000000-0000-4000-8000-0000000000a1';
const ENDS_AT = 100_000;
const betting = (bettingEndsAt = ENDS_AT): RoundDto => ({
  status: 'BETTING',
  id: ID,
  seedHash: 'h'.repeat(64),
  bettingEndsAt,
});
const storeWith = (round: RoundDto | null) => {
  const store = createGameStore();
  store.load({ round, bets: [], myBet: null, serverTime: 0 });
  return store;
};

/** O contador inteiro e o número dentro dele. */
const countdown = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-countdown]');
const seconds = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-countdown-seconds]');
/** Visível com este número, ou escondido (null). */
const shown = (container: HTMLElement) => {
  const element = countdown(container);
  if (!element) throw new Error('contador não montado');
  return element.hidden ? null : seconds(container)?.textContent;
};

describe('BettingCountdown (D100)', () => {
  it('BC10: na montagem, já mostra o valor da chamada imediata do loop, sem frame', () => {
    fakeFrames();
    const { container } = renderWithGame(<BettingCountdown />, {
      store: storeWith(betting()),
      serverNow: ENDS_AT - 7_200,
    });
    expect(shown(container)).toBe('8');
  });

  it('BC3: um round:started esconde o contador no frame seguinte', () => {
    const frames = fakeFrames();
    const { container, store } = renderWithGame(<BettingCountdown />, {
      store: storeWith(betting()),
      serverNow: ENDS_AT - 3_000,
    });
    expect(shown(container)).toBe('3');

    act(() =>
      store.receive({
        type: 'round:started',
        payload: { roundId: ID, startedAt: ENDS_AT },
        serverTime: ENDS_AT,
      }),
    );
    frames.step();

    expect(shown(container)).toBeNull();
  });

  it('BC4: escreve o valor entregue pelo loop, não uma leitura própria do relógio', () => {
    let emit: FrameListener = () => {};
    const frames: FrameLoop = {
      subscribe(listener) {
        emit = listener;
        return () => {};
      },
    };
    const { container } = renderWithGame(<BettingCountdown />, {
      store: storeWith(betting()),
      frames,
      serverNow: 0,
    });

    emit(ENDS_AT - 3_000);

    expect(shown(container)).toBe('3');
  });

  it('BC5: no StrictMode, uma assinatura no loop montado e nenhuma depois do unmount', () => {
    const frames = fakeFrames();
    const tracked = trackSubscriptions(
      createFrameLoop({ clock: { serverNow: () => ENDS_AT - 5_000 } }),
    );
    const { unmount } = renderWithGame(<BettingCountdown />, {
      store: storeWith(betting()),
      frames: tracked.loop,
      strict: true,
    });
    expect(tracked.live()).toBe(1);
    expect(frames.active()).toBe(1);

    unmount();

    expect(tracked.live()).toBe(0);
    expect(frames.active()).toBe(0);
  });

  it('BC6: só escreve no DOM quando o segundo muda', () => {
    const frames = fakeFrames();
    const { container, setServerNow } = renderWithGame(<BettingCountdown />, {
      store: storeWith(betting()),
      serverNow: ENDS_AT - 7_999,
    });
    const element = countdown(container);
    const number = seconds(container);
    expect(shown(container)).toBe('8');
    const text = vi.spyOn(Node.prototype, 'textContent', 'set');
    const hidden = vi.spyOn(HTMLElement.prototype, 'hidden', 'set');
    const onNumber = () =>
      text.mock.contexts.filter((context) => context === number).length;
    const onElement = () =>
      hidden.mock.contexts.filter((context) => context === element).length;

    // ~62 frames dentro do mesmo segundo (8).
    for (let remaining = 7_983; remaining >= 7_001; remaining -= 16) {
      setServerNow(ENDS_AT - remaining);
      frames.step();
    }
    expect(onNumber()).toBe(0);
    expect(onElement()).toBe(0);

    setServerNow(ENDS_AT - 6_999);
    frames.step();
    expect(onNumber()).toBe(1);
    expect(shown(container)).toBe('7');
    expect(onElement()).toBe(0);

    // O prazo vence: esconde uma vez, e não escreve mais.
    setServerNow(ENDS_AT);
    frames.step();
    setServerNow(ENDS_AT + 500);
    frames.step();
    expect(onElement()).toBe(1);
    expect(onNumber()).toBe(1);
  });

  it('BC7: fica fora da leitura de tela: aria-hidden e sem aria-live', () => {
    fakeFrames();
    const { container } = renderWithGame(<BettingCountdown />, {
      store: storeWith(betting()),
      serverNow: ENDS_AT - 3_000,
    });
    expect(countdown(container)?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('BC8: o contador some no mesmo instante em que o botão Apostar fecha', () => {
    const frames = fakeFrames();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(1_000_000);
    const offset = 50_000;
    const clock = { serverNow: () => Date.now() + offset };
    const endsAt = clock.serverNow() + 2_000;
    const store = storeWith(betting(endsAt));
    store.setState(
      (state) => signIn(state, { playerId: 'p-ana', nickname: 'ana' }, 100_000),
      true,
    );
    const { container } = renderWithGame(
      <>
        <BetPanel />
        <BettingCountdown />
      </>,
      { store, clock },
    );
    fireEvent.change(screen.getByLabelText('Valor da aposta'), {
      target: { value: '10' },
    });
    const betButton = () =>
      screen.getByRole<HTMLButtonElement>('button', { name: 'Apostar' });

    let sawDeadline = false;
    for (let step = 0; clock.serverNow() <= endsAt + 500; step++) {
      if (step > 0) {
        act(() => {
          vi.advanceTimersByTime(50);
          frames.step();
        });
      }
      const now = clock.serverNow();
      const open = !betButton().disabled;
      expect({ now, countdown: shown(container) !== null }).toEqual({
        now,
        countdown: open,
      });
      // Visível ⇒ pelo menos 1: o contador nunca mostra 0 com o botão aberto.
      const value = shown(container);
      if (value !== null) {
        const remaining = endsAt - now;
        expect({ remaining, value, atLeastOne: Number(value) >= 1 }).toEqual({
          remaining,
          value,
          atLeastOne: true,
        });
      }
      if (now === endsAt) {
        sawDeadline = true;
        expect(betButton().disabled).toBe(true);
        expect(shown(container)).toBeNull();
      }
    }
    expect(sawDeadline).toBe(true);
  });

  it('BC9: os frames não re-renderizam o React, nem na troca de segundo', () => {
    const frames = fakeFrames();
    const commits = vi.fn();
    const { setServerNow } = renderWithGame(
      <Profiler id="contador" onRender={commits}>
        <BettingCountdown />
      </Profiler>,
      { store: storeWith(betting()), serverNow: ENDS_AT - 5_000 },
    );
    commits.mockClear();

    for (let remaining = 4_900; remaining >= -500; remaining -= 100) {
      setServerNow(ENDS_AT - remaining);
      act(() => frames.step());
    }

    expect(commits).not.toHaveBeenCalled();
  });
});
