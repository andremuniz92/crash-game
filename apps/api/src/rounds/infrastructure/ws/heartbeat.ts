import type { WsClient, WsClients } from './ws-clients.js';

/**
 * Ping a cada intervalo (D15). Quem não respondeu ao ping anterior é
 * terminado: a conexão caiu sem o close chegar.
 */
export class Heartbeat {
  private readonly alive = new Map<WsClient, boolean>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly clients: WsClients,
    private readonly intervalMs: number,
  ) {}

  watch(client: WsClient): void {
    this.alive.set(client, true);
    client.on('pong', () => this.alive.set(client, true));
  }

  forget(client: WsClient): void {
    this.alive.delete(client);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.beat(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private beat(): void {
    for (const client of this.clients.all()) {
      if (this.alive.get(client) === false) {
        client.terminate();
        this.clients.remove(client);
        this.forget(client);
        continue;
      }
      this.alive.set(client, false);
      client.ping();
    }
  }
}
