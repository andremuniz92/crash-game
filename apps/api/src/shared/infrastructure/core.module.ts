import { Global, Module } from '@nestjs/common';
import { RandomIdGenerator } from './random-id-generator.js';
import { SystemClock } from './system-clock.js';
import { CLOCK, ID_GENERATOR } from './tokens.js';

/** Relógio e gerador de ids reais; os testes trocam os providers. */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: new SystemClock() },
    { provide: ID_GENERATOR, useValue: new RandomIdGenerator() },
  ],
  exports: [CLOCK, ID_GENERATOR],
})
export class CoreModule {}
