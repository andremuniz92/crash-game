import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { Actions } from '../app/actions.js';
import { type GameDeps, GameProvider } from '../app/game-context.js';
import { createGameStore } from '../store/game-store.js';

/** Ações falsas: todas resolvem 'done', e o teste troca as que precisar. */
export function fakeActions(overrides: Partial<Actions> = {}): Actions {
  return {
    createGuest: vi.fn(() => Promise.resolve({ status: 'done' as const })),
    restoreSession: vi.fn(() => Promise.resolve()),
    placeBet: vi.fn(() => Promise.resolve({ status: 'done' as const })),
    cashOut: vi.fn(() => Promise.resolve({ status: 'done' as const })),
    loadHistory: vi.fn(() => Promise.resolve()),
    fetchSnapshot: vi.fn(() =>
      Promise.reject(new Error('sem snapshot no teste')),
    ),
    ...overrides,
  };
}

/** Renderiza dentro do GameProvider com store real e relógio controlado. */
export function renderWithGame(
  ui: ReactNode,
  deps: Partial<GameDeps> & { serverNow?: number } = {},
): RenderResult & GameDeps & { setServerNow: (value: number) => void } {
  let serverNow = deps.serverNow ?? 0;
  const value: GameDeps = {
    store: deps.store ?? createGameStore(),
    actions: deps.actions ?? fakeActions(),
    clock: deps.clock ?? { serverNow: () => serverNow },
  };
  const result = render(<GameProvider value={value}>{ui}</GameProvider>);
  return {
    ...result,
    ...value,
    setServerNow: (value: number) => {
      serverNow = value;
    },
  };
}
