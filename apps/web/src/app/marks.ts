export type MarkName = 'app:first-render' | 'scene:first-frame';

export interface Marks {
  readonly once: (name: MarkName) => void;
}

/**
 * Marcas de desempenho do carregamento (D94, D97), uma vez cada: o StrictMode
 * e as remontagens não as repetem.
 */
export function createMarks(mark: (name: string) => void): Marks {
  const done = new Set<MarkName>();
  return {
    once(name) {
      if (done.has(name)) return;
      done.add(name);
      mark(name);
    },
  };
}
