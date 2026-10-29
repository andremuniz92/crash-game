import { describe, expect, it } from 'vitest';
import {
  assertBuildEnv,
  InvalidWebConfigError,
  readWebConfig,
} from './config.js';

describe('readWebConfig (D73)', () => {
  it('WC1: http vira ws, com o WebSocket em /ws na mesma origem', () => {
    expect(
      readWebConfig({ VITE_API_URL: 'http://localhost:3000', PROD: false }),
    ).toEqual({
      apiUrl: 'http://localhost:3000',
      wsUrl: 'ws://localhost:3000/ws',
    });
  });

  it('WC2: https vira wss', () => {
    expect(
      readWebConfig({ VITE_API_URL: 'https://api.example.app', PROD: true }),
    ).toEqual({
      apiUrl: 'https://api.example.app',
      wsUrl: 'wss://api.example.app/ws',
    });
  });

  it.each([undefined, '', '  '])(
    'WC3: sem VITE_API_URL (%j) em dev, usa a API local',
    (value) => {
      expect(readWebConfig({ VITE_API_URL: value, PROD: false })).toEqual({
        apiUrl: 'http://localhost:3000',
        wsUrl: 'ws://localhost:3000/ws',
      });
    },
  );

  it.each([undefined, '', '  '])(
    'WC4: sem VITE_API_URL (%j) no build de produção, falha',
    (value) => {
      const read = () => readWebConfig({ VITE_API_URL: value, PROD: true });
      expect(read).toThrow(InvalidWebConfigError);
      expect(read).toThrow(/VITE_API_URL é obrigatória/);
    },
  );

  it.each([
    'ftp://x.com',
    'localhost:3000',
    'http://x.com/api',
    'http://x.com/',
  ])('WC5: recusa "%s", que não é uma origem pura', (value) => {
    const read = () => readWebConfig({ VITE_API_URL: value, PROD: false });
    expect(read).toThrow(InvalidWebConfigError);
    expect(read).toThrow(/VITE_API_URL deve ser uma origem/);
  });
});

describe('assertBuildEnv (D85)', () => {
  it.each([{}, { VITE_API_URL: '' }, { VITE_API_URL: 'http://x.com/api' }])(
    'BC1: no build de produção, falha sem a variável ou com origem inválida (%j)',
    (env) => {
      expect(() => assertBuildEnv(env, 'production')).toThrow(
        InvalidWebConfigError,
      );
      expect(() => assertBuildEnv(env, 'production')).toThrow(/VITE_API_URL/);
    },
  );

  it('BC1: com a origem válida, o build de produção segue', () => {
    expect(() =>
      assertBuildEnv({ VITE_API_URL: 'https://api.example.app' }, 'production'),
    ).not.toThrow();
  });

  it('BC1: fora de produção não checa', () => {
    expect(() => assertBuildEnv({}, 'development')).not.toThrow();
  });
});
