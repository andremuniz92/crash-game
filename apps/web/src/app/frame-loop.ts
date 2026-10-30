import type { ServerClock } from '../net/server-clock.js';

export type FrameListener = (serverNow: number) => void;

export interface FrameLoop {
  /** Chama o assinante na hora e a cada frame; devolve o cancelamento. */
  subscribe(listener: FrameListener): () => void;
}

export type TimingListener = (frameTime: number) => void;

/**
 * Canal só de tempo, para o medidor de fps (D97): o timestamp do rAF de cada
 * frame, sem chamada imediata. Separado do FrameLoop para não mudar o que os
 * assinantes de serverNow recebem.
 */
export interface FrameTimings {
  subscribeTiming(listener: TimingListener): () => void;
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
}): FrameLoop & FrameTimings {
  const entries = new Set<Entry>();
  // Um objeto por assinatura: cancelar duas vezes não tira a de outro.
  const timings = new Set<{ listener: TimingListener }>();
  let request = 0;
  let frame = 0;
  /** serverNow do frame em andamento; null fora de um frame. */
  let frameNow: number | null = null;

  function call<T>(listener: (value: T) => void, value: T): void {
    try {
      listener(value);
    } catch (error) {
      onError(error);
    }
  }

  function start(): void {
    if (request === 0 && frameNow === null) {
      request = requestAnimationFrame(tick);
    }
  }

  function stopIfIdle(): void {
    if (entries.size === 0 && timings.size === 0 && request !== 0) {
      cancelAnimationFrame(request);
      request = 0;
    }
  }

  function tick(frameTime: number): void {
    request = 0;
    frame++;
    const now = clock.serverNow();
    frameNow = now;
    for (const entry of entries) {
      if (entry.since !== frame) call(entry.listener, now);
    }
    for (const timing of timings) call(timing.listener, frameTime);
    frameNow = null;
    if (entries.size > 0 || timings.size > 0) {
      request = requestAnimationFrame(tick);
    }
  }

  return {
    subscribeTiming(listener) {
      const timing = { listener };
      timings.add(timing);
      start();
      return () => {
        timings.delete(timing);
        stopIfIdle();
      };
    },
    subscribe(listener) {
      const entry: Entry = { listener, since: frame };
      entries.add(entry);
      start();
      // Um erro aqui não desfaz a assinatura, como um erro num frame não
      // cancela o assinante (FL5): ele pode ser passageiro, e o componente
      // recebe o cancelamento de volta e limpa no unmount como sempre.
      call(listener, frameNow ?? clock.serverNow());
      return () => {
        entries.delete(entry);
        stopIfIdle();
      };
    },
  };
}
