import type { GameStore } from '../store/game-store.js';

/**
 * Chama `callback` a cada chegada da conexão a live: a primeira e cada
 * reconexão (D76). Serve para recarregar o que o buffer não cobre, como os
 * crashes perdidos durante a queda. Devolve a desinscrição.
 */
export function whenLive(store: GameStore, callback: () => void): () => void {
  return store.subscribe((state, previous) => {
    if (state.connection === 'live' && previous.connection !== 'live') {
      callback();
    }
  });
}
