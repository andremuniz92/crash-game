import { Global, Module } from '@nestjs/common';
import { InMemoryEventPublisher } from './in-memory-event-publisher.js';
import { RandomIdGenerator } from './random-id-generator.js';
import { SystemClock } from './system-clock.js';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR } from './tokens.js';

/** Relógio, gerador de ids e eventos reais; os testes trocam os providers. */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: new SystemClock() },
    { provide: ID_GENERATOR, useValue: new RandomIdGenerator() },
    { provide: EVENT_PUBLISHER, useValue: new InMemoryEventPublisher() },
  ],
  exports: [CLOCK, ID_GENERATOR, EVENT_PUBLISHER],
})
export class CoreModule {}
