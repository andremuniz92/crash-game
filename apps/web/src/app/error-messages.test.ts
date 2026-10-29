import { CLIENT_ERROR_CODES } from '@crash/shared';
import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../net/api-client.js';
import { errorMessage, GENERIC_MESSAGE } from './error-messages.js';

describe('errorMessage', () => {
  it('EM1: cada código 4xx da seção 8.1 tem mensagem própria, e as mensagens não se repetem', () => {
    const messages = CLIENT_ERROR_CODES.map((code) =>
      errorMessage(new ApiError(400, code, 'mensagem do servidor')),
    );

    expect(CLIENT_ERROR_CODES).toHaveLength(15);
    for (const [index, message] of messages.entries()) {
      const code = CLIENT_ERROR_CODES[index];
      expect(message, code).not.toBe(GENERIC_MESSAGE);
      expect(message, code).not.toBe('mensagem do servidor');
      expect(message.length, code).toBeGreaterThan(0);
    }
    expect(new Set(messages).size).toBe(messages.length);
  });

  it.each(['INTERNAL_ERROR', 'HTTP_ERROR', 'NOT_FOUND', 'CODIGO_NOVO'])(
    'EM2: %s cai na mensagem genérica',
    (code) => {
      expect(errorMessage(new ApiError(500, code, 'x'))).toBe(GENERIC_MESSAGE);
    },
  );

  it('EM3: falha de rede e timeout têm mensagens próprias', () => {
    const network = errorMessage(new NetworkError('network', 'x'));
    const timeout = errorMessage(new NetworkError('timeout', 'x'));

    expect(network).toMatch(/conexão/);
    expect(timeout).toMatch(/demorou/);
    expect(network).not.toBe(timeout);
  });

  it('EM4: erro que não é da API (bug) cai na mensagem genérica', () => {
    expect(errorMessage(new TypeError('bug'))).toBe(GENERIC_MESSAGE);
    expect(errorMessage('texto')).toBe(GENERIC_MESSAGE);
  });
});
