import type { WsMessage } from '@crash/shared';
import { Logger, type LoggerService } from '@nestjs/common';

/**
 * O que o servidor usa de uma conexão do `ws`. Interface própria: o pacote
 * `ws` vem pelo @nestjs/platform-ws e não é dependência direta da api.
 */
export interface WsClient {
  readonly readyState: number;
  send(data: string): void;
  ping(): void;
  terminate(): void;
  on(event: 'pong' | 'close', listener: () => void): void;
}

/** `WebSocket.OPEN` do protocolo. */
const OPEN = 1;

/** As conexões abertas; o broadcast serializa uma vez e envia a todas. */
export class WsClients {
  private readonly clients = new Set<WsClient>();

  constructor(
    private readonly logger: Pick<LoggerService, 'error'> = new Logger(
      'WsClients',
    ),
  ) {}

  add(client: WsClient): void {
    this.clients.add(client);
  }

  remove(client: WsClient): void {
    this.clients.delete(client);
  }

  all(): Iterable<WsClient> {
    return [...this.clients];
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState !== OPEN) continue;
      try {
        client.send(data);
      } catch (error) {
        this.logger.error(
          `falha ao enviar ${message.type} para uma conexão`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
