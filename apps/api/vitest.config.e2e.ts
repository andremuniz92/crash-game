import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// O .env da raiz preenche o que não veio do ambiente; no CI, as variáveis do job vencem.
Object.assign(process.env, {
  ...loadEnv('test', '../../', ''),
  ...process.env,
});

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    // Mesmo banco e mesmo TRUNCATE da integração, arquivos em sequência (D66).
    globalSetup: ['./test/integration/global-setup.ts'],
    setupFiles: ['./test/integration/setup-each.ts'],
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
