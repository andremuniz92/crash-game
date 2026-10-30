import { createContext, useContext } from 'react';

/** Escala do palco (fitScale), publicada pelo GameStage sem re-render (D93). */
export interface StageScale {
  get(): number;
  subscribe(listener: (scale: number) => void): () => void;
}

export function createStageScale(): StageScale & {
  set(scale: number): void;
} {
  let current = 0;
  const listeners = new Set<(scale: number) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(scale) {
      current = scale;
      for (const listener of listeners) listener(scale);
    },
  };
}

/** Fora de um GameStage, a escala é 0 e nunca muda. */
export const StageScaleContext = createContext<StageScale>(createStageScale());

export const useStageScale = () => useContext(StageScaleContext);
