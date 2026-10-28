import type { WsMessage } from '@crash/shared';

/**
 * Cliente de teste com o WebSocket global do Node (D66). Guarda o texto
 * bruto e as mensagens recebidas, na ordem.
 */
export class WsTestClient {
  readonly raw: string[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      this.raw.push(String(event.data));
    });
  }

  static connect(url: string): Promise<WsTestClient> {
    const socket = new WebSocket(url);
    const client = new WsTestClient(socket);
    return new Promise((resolve, reject) => {
      socket.addEventListener('open', () => resolve(client), { once: true });
      socket.addEventListener(
        'error',
        () => reject(new Error(`falha ao conectar em ${url}`)),
        {
          once: true,
        },
      );
    });
  }

  get messages(): WsMessage[] {
    return this.raw.map((text) => JSON.parse(text) as WsMessage);
  }

  /** Mensagens sem os ticks, que chegam em qualquer ponto durante RUNNING. */
  get events(): WsMessage[] {
    return this.messages.filter((message) => message.type !== 'round:tick');
  }

  get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(text: string): void {
    this.socket.send(text);
  }

  /** Espera até `predicate` valer para as mensagens recebidas. */
  async waitFor(
    predicate: (messages: WsMessage[]) => boolean,
    timeoutMs = 2_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate(this.messages)) {
      if (Date.now() > deadline) {
        throw new Error(
          `mensagens esperadas não chegaram; recebidas: ${this.messages.map((m) => m.type).join(', ')}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** Espera a primeira mensagem do tipo e a devolve com o texto bruto. */
  async next<T extends WsMessage['type']>(
    type: T,
  ): Promise<{ message: Extract<WsMessage, { type: T }>; text: string }> {
    await this.waitFor((messages) => messages.some((m) => m.type === type));
    const index = this.messages.findIndex((m) => m.type === type);
    return {
      message: this.messages[index] as Extract<WsMessage, { type: T }>,
      text: this.raw[index]!,
    };
  }

  close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve) => {
      this.socket.addEventListener('close', () => resolve(), { once: true });
      this.socket.close();
    });
  }
}
