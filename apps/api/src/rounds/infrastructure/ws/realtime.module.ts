import { MikroORM } from '@mikro-orm/postgresql';
import {
  type BeforeApplicationShutdown,
  Inject,
  Module,
  type OnModuleInit,
} from '@nestjs/common';
import { PlayerRecord } from '../../../players/player.record.js';
import type { Clock } from '../../../shared/domain/clock.js';
import {
  APP_CONFIG,
  type AppConfig,
} from '../../../shared/infrastructure/config/app-config.js';
import type { InMemoryEventPublisher } from '../../../shared/infrastructure/in-memory-event-publisher.js';
import {
  CLOCK,
  EVENT_PUBLISHER,
} from '../../../shared/infrastructure/tokens.js';
import { Heartbeat } from './heartbeat.js';
import { NicknameDirectory } from './nickname-directory.js';
import { RoundsGateway } from './rounds.gateway.js';
import { TickBroadcaster } from './tick-broadcaster.js';
import { WsBroadcaster } from './ws-broadcaster.js';
import { WsClients } from './ws-clients.js';
import { isBroadcastEvent } from './ws-message.js';

/** Eventos de domínio → mensagens do WS (seção 8.2, D62, D68). */
@Module({
  providers: [
    RoundsGateway,
    { provide: WsClients, useValue: new WsClients() },
    {
      provide: Heartbeat,
      useFactory: (clients: WsClients, config: AppConfig) =>
        new Heartbeat(clients, config.wsHeartbeatMs),
      inject: [WsClients, APP_CONFIG],
    },
    {
      provide: WsBroadcaster,
      useFactory: (clients: WsClients, orm: MikroORM, clock: Clock) =>
        new WsBroadcaster(
          clients,
          // Leitura de outro contexto, permitida para consultas (D67).
          new NicknameDirectory(async (playerId) => {
            const player = await orm.em
              .fork()
              .findOneOrFail(
                PlayerRecord,
                { id: playerId },
                { fields: ['nickname'], disableIdentityMap: true },
              );
            return player.nickname;
          }),
          clock,
        ),
      inject: [WsClients, MikroORM, CLOCK],
    },
    {
      provide: TickBroadcaster,
      useFactory: (clients: WsClients, clock: Clock, config: AppConfig) =>
        new TickBroadcaster(clients, clock, config.tickMs),
      inject: [WsClients, CLOCK, APP_CONFIG],
    },
  ],
})
export class RealtimeModule implements OnModuleInit, BeforeApplicationShutdown {
  private unsubscribe: (() => void) | null = null;

  constructor(
    @Inject(EVENT_PUBLISHER) private readonly events: InMemoryEventPublisher,
    @Inject(WsBroadcaster) private readonly broadcaster: WsBroadcaster,
    @Inject(TickBroadcaster) private readonly ticks: TickBroadcaster,
    @Inject(Heartbeat) private readonly heartbeat: Heartbeat,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.subscribe((event) => {
      this.ticks.handle(event);
      if (isBroadcastEvent(event)) this.broadcaster.handle(event);
    });
    this.heartbeat.start();
  }

  /** Antes do DatabaseModule fechar o banco: a fila termina de enviar. */
  async beforeApplicationShutdown(): Promise<void> {
    this.unsubscribe?.();
    this.ticks.stop();
    this.heartbeat.stop();
    await this.broadcaster.idle();
  }
}
