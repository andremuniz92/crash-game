import { closeTestOrm, testOrm, truncateAll } from './test-orm.js';

// Cada teste começa com as tabelas vazias (D40).
beforeEach(async () => {
  await truncateAll(await testOrm());
});

afterAll(async () => {
  await closeTestOrm();
});
