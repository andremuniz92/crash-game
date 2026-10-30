import { render, type RenderResult } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { vi } from 'vitest';
import type { Actions } from '../app/actions.js';
import { createFrameLoop } from '../app/frame-loop.js';
import { type GameDeps, GameProvider } from '../app/game-context.js';
import type { SceneEnvironment } from '../game/mount-scene.js';
import { createGameStore } from '../store/game-store.js';

/** Ações falsas: todas resolvem 'done', e o teste troca as que precisar. */
export function fakeActions(overrides: Partial<Actions> = {}): Actions {
  return {
    createGuest: vi.fn(() => Promise.resolve({ status: 'done' as const })),
    restoreSession: vi.fn(() => Promise.resolve()),
    placeBet: vi.fn(() => Promise.resolve({ status: 'done' as const })),
    cashOut: vi.fn(() => Promise.resolve({ status: 'done' as const })),
    loadHistory: vi.fn(() => Promise.resolve()),
    loadWallet: vi.fn(() =>
      Promise.resolve({
        status: 'failed' as const,
        message: 'sem carteira no teste',
      }),
    ),
    verifyRound: vi.fn(() =>
      Promise.resolve({
        status: 'failed' as const,
        message: 'sem verificação no teste',
      }),
    ),
    fetchSnapshot: vi.fn(() =>
      Promise.reject(new Error('sem snapshot no teste')),
    ),
    ...overrides,
  };
}

/**
 * Cena que nunca monta: o carregador não resolve, sem movimento reduzido e DPR 1.
 * Os testes que não são da cena não criam canvas nem precisam de matchMedia,
 * que o jsdom não tem.
 */
export function idleScene(): SceneEnvironment {
  return {
    loadScene: () => new Promise(() => {}),
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    devicePixelRatio: () => 1,
  };
}

/**
 * Renderiza dentro do GameProvider com store real e relógio controlado.
 * `strict` põe o StrictMode na raiz, como no main.tsx: o React 19 só monta,
 * desmonta e monta de novo os efeitos quando o StrictMode está na raiz, e
 * não quando vem aninhado dentro do provider.
 */
export function renderWithGame(
  ui: ReactNode,
  deps: Partial<GameDeps> & { serverNow?: number; strict?: boolean } = {},
): RenderResult & GameDeps & { setServerNow: (value: number) => void } {
  let serverNow = deps.serverNow ?? 0;
  const clock = deps.clock ?? { serverNow: () => serverNow };
  const value: GameDeps = {
    store: deps.store ?? createGameStore(),
    actions: deps.actions ?? fakeActions(),
    clock,
    frames: deps.frames ?? createFrameLoop({ clock }),
    scene: deps.scene ?? idleScene(),
    marks: deps.marks ?? { once: vi.fn() },
  };
  const tree = <GameProvider value={value}>{ui}</GameProvider>;
  const result = render(deps.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return {
    ...result,
    ...value,
    setServerNow: (value: number) => {
      serverNow = value;
    },
  };
}
