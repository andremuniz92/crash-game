import { Logger } from '@nestjs/common';
import { readDatabaseConfig } from './shared/infrastructure/database/database-config.js';
import { runMigrations } from './shared/infrastructure/database/run-migrations.js';

/*
 * `node dist/migrate.js`: o preDeployCommand do Railway (D104), sem a CLI do
 * MikroORM nem o tsx, que ficam fora da imagem. Uma falha rejeita o top-level
 * await, o processo sai com 1 e o deploy é abortado.
 */
const logger = new Logger('Migrate');
const applied = await runMigrations(readDatabaseConfig(process.env).clientUrl);
logger.log(
  applied.length > 0
    ? `migrations aplicadas: ${applied.join(', ')}`
    : 'nenhuma migration pendente',
);
