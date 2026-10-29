import { createContext, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';
import type { ServerClock } from '../net/server-clock.js';
import type { GameState } from '../store/game-state.js';
import type { GameStore } from '../store/game-store.js';
import type { Actions } from './actions.js';
import type { FrameLoop } from './frame-loop.js';

/**
 * O que os componentes precisam, vindo do composition root (main.tsx). Nos
 * testes, o provider recebe fakes (D82).
 */
export interface GameDeps {
  store: GameStore;
  actions: Actions;
  clock: Pick<ServerClock, 'serverNow'>;
  /** O único laço de animação (D89): quem desenha por frame assina aqui. */
  frames: FrameLoop;
}

const GameContext = createContext<GameDeps | null>(null);

export function GameProvider({
  value,
  children,
}: {
  value: GameDeps;
  children: ReactNode;
}) {
  return <GameContext value={value}>{children}</GameContext>;
}

export function useGame(): GameDeps {
  const deps = useContext(GameContext);
  if (!deps) throw new Error('useGame precisa estar dentro do GameProvider');
  return deps;
}

/** Lê um pedaço da store; re-renderiza só quando ele muda (D75). */
export function useGameState<T>(selector: (state: GameState) => T): T {
  return useStore(useGame().store, selector);
}
