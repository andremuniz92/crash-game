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
    include: ['test/integration/**/*.int-spec.ts', 'src/**/*.int-spec.ts'],
    globalSetup: ['./test/integration/global-setup.ts'],
    setupFiles: ['./test/integration/setup-each.ts'],
    // Todos os arquivos usam o mesmo banco e fazem TRUNCATE: em sequência (D40).
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
