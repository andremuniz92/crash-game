import './testing/silence-canvas.js'; // primeiro import: troca o getContext antes de o Pixi carregar
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from './app/actions.js';
import { createMarks } from './app/marks.js';
import { App } from './App.js';
import type { RoundDto } from '@crash/shared';
import { signIn } from './store/game-state.js';
import { createGameStore } from './store/game-store.js';
import { fakeFrames, fakeResizeObserver } from './testing/fake-browser.js';
import { fakeActions, renderWithGame } from './testing/render-game.js';

const ana = {
  playerId: 'a0a0a0a0-0000-4000-8000-000000000001',
  nickname: 'ana',
};

function renderApp(options: Parameters<typeof renderWithGame>[1] = {}) {
  fakeFrames();
  fakeResizeObserver();
  return renderWithGame(<App />, options);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('AP1: sem jogador, mostra o formulário de guest; com jogador, não, e o cabeçalho mostra o nickname', () => {
    const { store } = renderApp();
    expect(screen.queryByLabelText('Nickname')).not.toBeNull();

    act(() => store.setState((state) => signIn(state, ana, 100_000), true));

    expect(screen.queryByLabelText('Nickname')).toBeNull();
    expect(screen.getByRole('banner').textContent).toContain('ana');
    expect(screen.getByRole('region', { name: 'Aposta' })).toBeTruthy();
  });

  it('AP2: depois de um createGuest bem-sucedido, o formulário some sem recarregar', async () => {
    const user = userEvent.setup();
    const store = createGameStore();
    const createGuest = vi.fn((nickname: string) => {
      store.setState(
        (state) => signIn(state, { ...ana, nickname }, 100_000),
        true,
      );
      return Promise.resolve<ActionResult>({ status: 'done' });
    });
    renderApp({ store, actions: fakeActions({ createGuest }) });

    await user.type(screen.getByLabelText('Nickname'), 'bia');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.queryByLabelText('Nickname')).toBeNull();
    expect(screen.getByRole('banner').textContent).toContain('bia');
  });

  it('AR3: a única região aria-live é o anunciador, com e sem jogador', () => {
    const { store } = renderApp();
    const liveRegions = () => document.querySelectorAll('[aria-live]');

    expect(liveRegions()).toHaveLength(1);
    expect(
      document.querySelectorAll('[role="status"], [role="alert"]'),
    ).toHaveLength(0);

    // A11: com o painel de aposta montado, continua uma só.
    act(() => store.setState((state) => signIn(state, ana, 100_000), true));
    expect(screen.getByRole('region', { name: 'Aposta' })).toBeTruthy();
    expect(liveRegions()).toHaveLength(1);
  });

  it('AR4: em BETTING, o contador aparece no palco e a única região aria-live continua o anunciador', () => {
    const store = createGameStore();
    store.load({
      round: {
        status: 'BETTING',
        id: '00000000-0000-4000-8000-0000000000a1',
        seedHash: 'h'.repeat(64),
        bettingEndsAt: 10_000,
      },
      bets: [],
      myBet: null,
      serverTime: 0,
    });
    renderApp({ store, serverNow: 5_000 });

    const stage = document.querySelector('[data-stage]');
    const countdown = stage?.querySelector<HTMLElement>('[data-countdown]');
    expect(countdown?.hidden).toBe(false);
    expect(countdown?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('LZ1: com o chunk da cena ainda carregando, o texto anima, o painel está na tela e o app já é jogável', () => {
    const frames = fakeFrames();
    fakeResizeObserver();
    const mark = vi.fn();
    const loadScene = vi.fn(() => new Promise<never>(() => {}));
    const store = createGameStore();
    const running: RoundDto = {
      status: 'RUNNING',
      id: '00000000-0000-4000-8000-0000000000a1',
      seedHash: 'h'.repeat(64),
      bettingEndsAt: 10_000,
      startedAt: 10_000,
    };
    store.load({ round: running, bets: [], myBet: null, serverTime: 0 });
    const { setServerNow } = renderWithGame(<App />, {
      store,
      serverNow: 10_000,
      marks: createMarks(mark),
      scene: {
        loadScene,
        matchMedia: () => ({
          matches: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
        devicePixelRatio: () => 1,
      },
    });

    expect(loadScene).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Nickname')).not.toBeNull();
    expect(mark.mock.calls).toEqual([['app:first-render']]);
    expect(document.querySelectorAll('[data-stage] canvas')).toHaveLength(0);
    const text = () =>
      document.querySelector('[data-stage] p[aria-hidden="true"]')?.textContent;
    setServerNow(10_000 + 11_553);
    act(() => frames.step());
    expect(text()).toBe('2,00x');
  });

  it('AP5: app:first-render é marcado uma vez, mesmo com o StrictMode', () => {
    const mark = vi.fn();
    renderApp({ strict: true, marks: createMarks(mark) });
    expect(mark.mock.calls).toEqual([['app:first-render']]);
  });
});
