import { describe, expect, it, vi } from 'vitest';
import { setConnection } from '../store/game-state.js';
import { createGameStore } from '../store/game-store.js';
import { whenLive } from './when-live.js';

describe('whenLive (D76)', () => {
  it('HI6: chama a cada chegada a live, inclusive depois de uma reconexão, e para ao desinscrever', () => {
    const store = createGameStore();
    const callback = vi.fn();
    const stop = whenLive(store, callback);
    const go = (status: Parameters<typeof setConnection>[1]) =>
      store.setState((state) => setConnection(state, status), true);

    go('syncing');
    expect(callback).not.toHaveBeenCalled();
    go('live');
    expect(callback).toHaveBeenCalledTimes(1);
    go('waiting');
    go('connecting');
    go('syncing');
    go('live');
    expect(callback).toHaveBeenCalledTimes(2);

    stop();
    go('waiting');
    go('live');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('HI6: outras mudanças com a conexão já em live não chamam de novo', () => {
    const store = createGameStore();
    store.setState((state) => setConnection(state, 'live'), true);
    const callback = vi.fn();
    whenLive(store, callback);

    store.setState((state) => ({ ...state, balance: 1 }), true);

    expect(callback).not.toHaveBeenCalled();
  });
});
