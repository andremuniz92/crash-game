import { Logger, type LoggerService } from '@nestjs/common';
import type { Clock } from '../../../shared/domain/clock.js';
import type { WsClients } from './ws-clients.js';
import { type BroadcastEvent, toWsMessage } from './ws-message.js';

/**
 * Envia os eventos de domínio aos clientes numa fila única (D68): a
 * consulta assíncrona do nickname não muda a ordem de publicação. Um evento
 * que falha vai para o log e não trava os seguintes.
 */
export class WsBroadcaster {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly clients: Pick<WsClients, 'broadcast'>,
    private readonly nicknames: {
      nicknameOf(playerId: string): Promise<string>;
    },
    private readonly clock: Clock,
    private readonly logger: Pick<LoggerService, 'error'> = new Logger(
      'WsBroadcaster',
    ),
  ) {}

  handle(event: BroadcastEvent): void {
    this.queue = this.queue
      .then(() => this.deliver(event))
      .catch((error: unknown) => {
        this.logger.error(
          `falha ao transmitir ${event.type}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  /** Resolve quando a fila esvazia (testes e shutdown). */
  idle(): Promise<void> {
    return this.queue;
  }

  private async deliver(event: BroadcastEvent): Promise<void> {
    const nickname =
      'playerId' in event
        ? await this.nicknames.nicknameOf(event.playerId)
        : undefined;
    // O serverTime é lido na hora do envio (seção 8.2).
    const message = toWsMessage(event, {
      serverTime: this.clock.now(),
      nickname,
    });
    if (message) this.clients.broadcast(message);
  }
}
