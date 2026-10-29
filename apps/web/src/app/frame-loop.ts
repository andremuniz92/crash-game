import type { ServerClock } from '../net/server-clock.js';

export type FrameListener = (serverNow: number) => void;

export interface FrameLoop {
  /** Chama o assinante na hora e a cada frame; devolve o cancelamento. */
  subscribe(listener: FrameListener): () => void;
}

interface Entry {
  listener: FrameListener;
  /** Frame em que assinou; quem entra no meio de um frame só roda no próximo. */
  since: number;
}

/**
 * O único laço de animação do front (D89): um rAF, uma leitura do relógio
 * por frame, o mesmo valor para todos. Texto e cena concordam no mesmo frame,
 * e o loop para quando ninguém assina.
 */
export function createFrameLoop({
  clock,
  onError = (error) => console.error('[frame]', error),
}: {
  clock: Pick<ServerClock, 'serverNow'>;
  onError?: (error: unknown) => void;
}): FrameLoop {
  const entries = new Set<Entry>();
  let request = 0;
  let frame = 0;
  /** serverNow do frame em andamento; null fora de um frame. */
  let frameNow: number | null = null;

  function call(listener: FrameListener, serverNow: number): void {
    try {
      listener(serverNow);
    } catch (error) {
      onError(error);
    }
  }

  function tick(): void {
    request = 0;
    frame++;
    const now = clock.serverNow();
    frameNow = now;
    for (const entry of entries) {
      if (entry.since !== frame) call(entry.listener, now);
    }
    frameNow = null;
    if (entries.size > 0) request = requestAnimationFrame(tick);
  }

  return {
    subscribe(listener) {
      const entry: Entry = { listener, since: frame };
      entries.add(entry);
      if (request === 0 && frameNow === null) {
        request = requestAnimationFrame(tick);
      }
      // Um erro aqui não desfaz a assinatura, como um erro num frame não
      // cancela o assinante (FL5): ele pode ser passageiro, e o componente
      // recebe o cancelamento de volta e limpa no unmount como sempre.
      call(listener, frameNow ?? clock.serverNow());
      return () => {
        entries.delete(entry);
        if (entries.size === 0 && request !== 0) {
          cancelAnimationFrame(request);
          request = 0;
        }
      };
    },
  };
}
