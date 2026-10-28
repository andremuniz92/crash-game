import { Inject } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Heartbeat } from './heartbeat.js';
import { type WsClient, WsClients } from './ws-clients.js';

/**
 * Canal só de leitura em `/ws` (D4, seção 8.2): sem autenticação e sem
 * handlers de mensagem, então o que o cliente envia é ignorado (D68).
 */
@WebSocketGateway({ path: '/ws' })
export class RoundsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    @Inject(WsClients) private readonly clients: WsClients,
    @Inject(Heartbeat) private readonly heartbeat: Heartbeat,
  ) {}

  handleConnection(client: WsClient): void {
    this.clients.add(client);
    this.heartbeat.watch(client);
  }

  handleDisconnect(client: WsClient): void {
    this.clients.remove(client);
    this.heartbeat.forget(client);
  }
}
