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
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
