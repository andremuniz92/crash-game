import { Logger, type LoggerService } from '@nestjs/common';
import type {
  EventPublisher,
  PublishedEvent,
} from '../application/event-publisher.js';

type Listener = (event: PublishedEvent) => void;

/**
 * Entrega síncrona, no mesmo processo (D62, D13). O evento já foi commitado:
 * um ouvinte que falha vai para o log e não afeta os outros nem quem publicou.
 */
export class InMemoryEventPublisher implements EventPublisher {
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly logger: Pick<LoggerService, 'error'> = new Logger(
      'InMemoryEventPublisher',
    ),
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(events: readonly PublishedEvent[]): void {
    for (const event of events) {
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (error) {
          this.logger.error(
            `ouvinte falhou no evento ${event.type}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }
  }
}
