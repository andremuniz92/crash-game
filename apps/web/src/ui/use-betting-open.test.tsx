import type { RoundDto } from '@crash/shared';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../store/game-store.js';
import { renderWithGame } from '../testing/render-game.js';
import { useBettingOpen } from './use-betting-open.js';

const ROUND = '00000000-0000-4000-8000-0000000000a1';
/** O servidor está 50 s à frente do Date.now (falso) do teste. */
let offset = 50_000;
const clock = { serverNow: () => Date.now() + offset };

function Probe() {
  return <p>{useBettingOpen() ? 'aberto' : 'fechado'}</p>;
}

function setup(round: RoundDto | null) {
  const store = createGameStore();
  store.load({ round, bets: [], myBet: null, serverTime: clock.serverNow() });
  const result = renderWithGame(<Probe />, { store, clock });
  return { ...result, text: () => result.container.textContent };
}

const betting = (bettingEndsAt: number, id = ROUND): RoundDto => ({
  status: 'BETTING',
  id,
  seedHash: 'h'.repeat(64),
  bettingEndsAt,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  offset = 50_000;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBettingOpen (D74)', () => {
  it('BO1: fecha pelo serverNow(), não pelo Date.now, sem mensagem nova', async () => {
    const { text } = setup(betting(clock.serverNow() + 3_000));
    expect(text()).toBe('aberto');

    await act(() => vi.advanceTimersByTimeAsync(2_999));
    expect(text()).toBe('aberto');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(text()).toBe('fechado');
  });

  it('BO2: no disparo, se o offset mudou e ainda falta tempo, reagenda e fecha no prazo novo', async () => {
    const { text } = setup(betting(clock.serverNow() + 3_000));

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    offset -= 1_000; // o relógio do servidor estimado recua 1 s
    await act(() => vi.advanceTimersByTimeAsync(2_000)); // o timer original dispara aqui
    expect(text()).toBe('aberto');
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(text()).toBe('aberto');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(text()).toBe('fechado');
  });

  it('BO3: fora de BETTING fica fechado; um round:betting novo reabre', () => {
    const running: RoundDto = {
      ...betting(clock.serverNow() - 1),
      status: 'RUNNING',
      startedAt: clock.serverNow() - 1,
    };
    const { text, store } = setup(running);
    expect(text()).toBe('fechado');

    act(() =>
      store.receive({
        type: 'round:betting',
        payload: {
          roundId: '00000000-0000-4000-8000-0000000000a2',
          seedHash: 'h'.repeat(64),
          bettingEndsAt: clock.serverNow() + 10_000,
        },
        serverTime: clock.serverNow(),
      }),
    );
    expect(text()).toBe('aberto');
  });

  it('BO3: sem rodada, fechado', () => {
    expect(setup(null).text()).toBe('fechado');
  });

  it('BO6: no unmount, o timer é cancelado', () => {
    const { unmount } = setup(betting(clock.serverNow() + 3_000));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
