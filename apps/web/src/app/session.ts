import { parseNickname } from '@crash/shared';

/** O que o guest precisa para voltar depois de recarregar a página (D77). */
export interface Session {
  playerId: string;
  nickname: string;
  token: string;
}

export type KeyValueStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export interface SessionStorage {
  load(): Session | null;
  save(session: Session): void;
  clear(): void;
}

export const SESSION_KEY = 'crash.session';

/**
 * Sessão do guest no `localStorage` injetado (D77). Conteúdo corrompido ou
 * de outro formato é descartado e removido. Se o storage lançar (modo
 * privado, bloqueio do navegador), a sessão vale só em memória nesta página.
 */
export function createSessionStorage(storage: KeyValueStorage): SessionStorage {
  // undefined: ainda não lido do storage.
  let current: Session | null | undefined;

  function attempt(action: () => void): void {
    try {
      action();
    } catch {
      // Storage indisponível: fica a cópia em memória.
    }
  }

  return {
    load() {
      if (current !== undefined) return current;
      let raw: string | null = null;
      attempt(() => {
        raw = storage.getItem(SESSION_KEY);
      });
      current = raw === null ? null : parse(raw);
      if (raw !== null && current === null) {
        attempt(() => storage.removeItem(SESSION_KEY));
      }
      return current;
    },
    save(session) {
      current = session;
      attempt(() => storage.setItem(SESSION_KEY, JSON.stringify(session)));
    },
    clear() {
      current = null;
      attempt(() => storage.removeItem(SESSION_KEY));
    },
  };
}

function parse(raw: string): Session | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'playerId' in value &&
    typeof value.playerId === 'string' &&
    'nickname' in value &&
    typeof value.nickname === 'string' &&
    parseNickname(value.nickname) === value.nickname &&
    'token' in value &&
    typeof value.token === 'string' &&
    value.token !== ''
  ) {
    return {
      playerId: value.playerId,
      nickname: value.nickname,
      token: value.token,
    };
  }
  return null;
}
