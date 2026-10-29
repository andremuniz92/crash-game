import { vi } from 'vitest';

/**
 * requestAnimationFrame falso: os frames só rodam quando o teste chama
 * `step()`, e `active()` conta os pedidos ainda não atendidos nem cancelados.
 */
export function fakeFrames() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    pending.delete(id);
  });
  return {
    active: () => pending.size,
    step(frames = 1) {
      for (let i = 0; i < frames; i++) {
        const due = [...pending.values()];
        pending.clear();
        for (const callback of due) callback(0);
      }
    },
  };
}

/** ResizeObserver falso (o jsdom não tem): o teste dispara as medidas. */
export function fakeResizeObserver() {
  const observers: FakeResizeObserver[] = [];
  class FakeResizeObserver {
    readonly observed: Element[] = [];
    disconnected = false;
    constructor(readonly callback: ResizeObserverCallback) {
      observers.push(this);
    }
    observe(target: Element) {
      this.observed.push(target);
    }
    unobserve() {}
    disconnect() {
      this.disconnected = true;
    }
    resize(width: number, height: number) {
      const entry = {
        target: this.observed[0],
        contentRect: { width, height },
      } as unknown as ResizeObserverEntry;
      this.callback([entry], this as unknown as ResizeObserver);
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return {
    last: () => {
      const observer = observers.at(-1);
      if (!observer) throw new Error('nenhum ResizeObserver criado');
      return observer;
    },
  };
}
