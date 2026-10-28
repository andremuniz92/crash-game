import { initTestOrm } from './test-orm.js';

/** Uma vez por execução: cria o banco de teste se faltar e aplica as migrations (D40). */
export default async function setup(): Promise<void> {
  const orm = await initTestOrm({ createDatabase: true });
  try {
    await orm.schema.ensureDatabase();
    await orm.migrator.up();
  } finally {
    await orm.close();
  }
}
