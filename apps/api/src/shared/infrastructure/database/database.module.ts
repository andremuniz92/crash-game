import { MikroORM } from '@mikro-orm/postgresql';
import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { MikroOrmUnitOfWork } from './mikro-orm-unit-of-work.js';
import { ormOptions } from './orm-options.js';

/** Token da `UnitOfWork` (D56). */
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

/**
 * O MikroORM 7 só conecta no primeiro uso. Conectar e testar aqui faz a API
 * falhar no boot, com a causa, quando o banco está fora.
 */
async function connect(config: AppConfig): Promise<MikroORM> {
  const orm = await MikroORM.init(ormOptions(config.database.clientUrl));
  await orm.connect();
  const check = await orm.checkConnection();
  if (!check.ok) {
    await orm.close();
    throw new Error(`sem conexão com o banco: ${check.reason}`, {
      cause: check.error,
    });
  }
  return orm;
}

/** MikroORM criado por provider próprio, sem @mikro-orm/nestjs (D56). */
@Global()
@Module({
  providers: [
    {
      provide: MikroORM,
      useFactory: connect,
      inject: [APP_CONFIG],
    },
    {
      provide: UNIT_OF_WORK,
      useFactory: (orm: MikroORM) => new MikroOrmUnitOfWork(orm),
      inject: [MikroORM],
    },
  ],
  exports: [MikroORM, UNIT_OF_WORK],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  async onApplicationShutdown(): Promise<void> {
    await this.orm.close();
  }
}
