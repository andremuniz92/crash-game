import type { WsClient } from '../ws-clients.js';

/** Conexão falsa para os testes do registro, do broadcast e do heartbeat. */
export class FakeWsClient implements WsClient {
  readyState = 1;
  readonly sent: string[] = [];
  pings = 0;
  terminated = false;
  failOnSend = false;
  private readonly listeners = new Map<string, Array<() => void>>();

  send(data: string): void {
    if (this.failOnSend) throw new Error('socket quebrado');
    this.sent.push(data);
  }

  ping(): void {
    this.pings++;
  }

  terminate(): void {
    this.terminated = true;
    this.readyState = 3;
  }

  on(event: 'pong' | 'close', listener: () => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: 'pong' | 'close'): void {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }

  messages(): unknown[] {
    return this.sent.map((data) => JSON.parse(data) as unknown);
  }
}
