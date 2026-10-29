import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // O .env da raiz é o mesmo da API; o Vite só expõe ao front as variáveis
  // com prefixo VITE_ (D73).
  envDir: '../../',
  server: {
    // 0.0.0.0 para o host alcançar o Vite que roda dentro do AI Jail.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  test: {
    // Lógica no node; componentes no jsdom, que só os .tsx pagam (D82).
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./src/testing/setup-dom.ts'],
        },
      },
    ],
  },
});
