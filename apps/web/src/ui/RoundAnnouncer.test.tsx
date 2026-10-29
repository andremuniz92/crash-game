import type { WsMessage } from '@crash/shared';
import { act } from '@testing-library/react';
import { Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../store/game-store.js';
import { renderWithGame } from '../testing/render-game.js';
import { RoundAnnouncer } from './RoundAnnouncer.js';

const ROUND = '00000000-0000-4000-8000-0000000000a1';
const msg = {
  betting: {
    type: 'round:betting',
    payload: {
      roundId: ROUND,
      seedHash: 'h'.repeat(64),
      bettingEndsAt: 10_000,
    },
    serverTime: 0,
  },
  started: {
    type: 'round:started',
    payload: { roundId: ROUND, startedAt: 10_000 },
    serverTime: 10_000,
  },
  tick: {
    type: 'round:tick',
    payload: { roundId: ROUND, multiplier: 150 },
    serverTime: 15_000,
  },
  placed: {
    type: 'bet:placed',
    payload: {
      roundId: ROUND,
      betId: 'b0b0b0b0-0000-4000-8000-000000000001',
      nickname: 'ana',
      amount: 1_000,
    },
    serverTime: 1_000,
  },
  crashed: {
    type: 'round:crashed',
    payload: { roundId: ROUND, crashPoint: 235, serverSeed: 's'.repeat(64) },
    serverTime: 25_000,
  },
} satisfies Record<string, WsMessage>;

const region = () => document.querySelector('[aria-live="polite"]');

describe('RoundAnnouncer', () => {
  it('AR1: anuncia a abertura das apostas, o início da rodada e o crash', () => {
    const store = createGameStore();
    renderWithGame(<RoundAnnouncer />, { store });

    act(() => store.receive(msg.betting));
    expect(region()?.textContent).toBe('Apostas abertas');
    act(() => store.receive(msg.started));
    expect(region()?.textContent).toBe('A rodada começou');
    act(() => store.receive(msg.crashed));
    expect(region()?.textContent).toBe('Crash em 2,35x');
  });

  it('AR2: ticks e apostas não mudam o anúncio nem re-renderizam o anunciador', () => {
    const store = createGameStore();
    store.receive(msg.betting);
    const commits = vi.fn();
    renderWithGame(
      <Profiler id="anunciador" onRender={commits}>
        <RoundAnnouncer />
      </Profiler>,
      { store },
    );
    act(() => store.receive(msg.started));
    commits.mockClear();

    act(() => {
      store.receive(msg.tick);
      store.receive(msg.placed);
      store.receive({ ...msg.tick, serverTime: 16_000 });
    });

    expect(commits).not.toHaveBeenCalled();
    expect(region()?.textContent).toBe('A rodada começou');
  });
});
