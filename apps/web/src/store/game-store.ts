import type { CurrentRoundResponse, WsMessage } from '@crash/shared';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  applyMessage,
  applySnapshot,
  type GameState,
  initialGameState,
} from './game-state.js';

/**
 * Store única do jogo (D75): o React lê com `useStore(store, seletor)` e o
 * Pixi, com `subscribe`, fora do ciclo do React (D10). Não chama a rede.
 */
export type GameStore = StoreApi<GameState> & {
  load(snapshot: CurrentRoundResponse): void;
  receive(message: WsMessage): void;
};

export function createGameStore(): GameStore {
  const store = createStore<GameState>(() => initialGameState);
  // Quando o redutor devolve o mesmo objeto, o Zustand não avisa ninguém.
  return {
    ...store,
    load: (snapshot) =>
      store.setState((state) => applySnapshot(state, snapshot), true),
    receive: (message) =>
      store.setState((state) => applyMessage(state, message), true),
  };
}
