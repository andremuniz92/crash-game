import type { WsMessage } from '@crash/shared';
import type { SocketLike } from '../net/connection.js';

/** WebSocket falso (D82), dirigido pelo teste. */
export class FakeWebSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {}

  open(): void {
    this.onopen?.();
  }

  serverSends(message: WsMessage): void {
    this.serverSendsRaw(JSON.stringify(message));
  }

  serverSendsRaw(text: string): void {
    this.onmessage?.({ data: text });
  }

  /** Queda limpa: o navegador dispara close. */
  drop(): void {
    this.closed = true;
    this.onclose?.();
  }

  /** Queda com erro: o navegador dispara error e, em seguida, close. */
  fail(): void {
    this.onerror?.();
    this.closed = true;
    this.onclose?.();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
}

/** Fábrica de sockets que guarda cada um criado, na ordem. */
export function fakeSockets() {
  const sockets: FakeWebSocket[] = [];
  return {
    sockets,
    createSocket: (url: string) => {
      const socket = new FakeWebSocket(url);
      sockets.push(socket);
      return socket;
    },
    last: () => {
      const socket = sockets.at(-1);
      if (!socket) throw new Error('nenhum socket criado');
      return socket;
    },
  };
}
