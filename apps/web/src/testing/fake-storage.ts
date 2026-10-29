import type { KeyValueStorage } from '../app/session.js';

/** `localStorage` falso, em memória (D82). */
export function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
  return { storage, items };
}

/** Storage bloqueado (modo privado, política do navegador): tudo lança. */
export const blockedStorage: KeyValueStorage = {
  getItem: () => {
    throw new DOMException('bloqueado', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('bloqueado', 'SecurityError');
  },
  removeItem: () => {
    throw new DOMException('bloqueado', 'SecurityError');
  },
};
