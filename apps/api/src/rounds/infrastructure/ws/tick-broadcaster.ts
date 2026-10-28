import { multiplierAt } from '@crash/shared';
import type { PublishedEvent } from '../../../shared/application/event-publisher.js';
import type { Clock } from '../../../shared/domain/clock.js';
import type { WsClients } from './ws-clients.js';

/**
 * `round:tick` a cada `tickMs` durante RUNNING (D11, D68): só sincroniza o
 * cliente, que calcula o multiplicador a cada frame. Usa o `startedAt` do
 * evento e o relógio, sem teto no crash point, que é segredo (D30).
 */
export class TickBroadcaster {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly clients: Pick<WsClients, 'broadcast'>,
    private readonly clock: Clock,
    private readonly tickMs: number,
  ) {}

  handle(event: PublishedEvent): void {
    if (isRoundStarted(event)) this.start(event.roundId, event.startedAt);
    else if (event.type === 'RoundCrashed') this.stop();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private start(roundId: string, startedAt: number): void {
    this.stop();
    this.timer = setInterval(() => {
      const now = this.clock.now();
      this.clients.broadcast({
        type: 'round:tick',
        payload: { roundId, multiplier: multiplierAt(now - startedAt) },
        serverTime: now,
      });
    }, this.tickMs);
  }
}

function isRoundStarted(
  event: PublishedEvent,
): event is PublishedEvent & { roundId: string; startedAt: number } {
  return event.type === 'RoundStarted';
}
