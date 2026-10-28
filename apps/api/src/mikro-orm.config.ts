import { readDatabaseConfig } from './shared/infrastructure/database/database-config.js';
import { ormOptions } from './shared/infrastructure/database/orm-options.js';

/** Configuração lida pela CLI do MikroORM (`pnpm orm ...`). */
export default ormOptions(readDatabaseConfig(process.env).clientUrl);
