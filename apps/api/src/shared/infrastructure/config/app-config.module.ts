import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, readAppConfig } from './app-config.js';

/** Configuração lida uma vez do ambiente (D64); os testes trocam o provider. */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => readAppConfig(process.env) },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
