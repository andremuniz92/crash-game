import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_ERROR_CODES } from '@crash/shared';
import { ERROR_STATUS } from './error-status.js';

/*
 * E5 (D58): todo erro de domínio precisa estar classificado na tabela, e a
 * tabela não pode citar código que não existe mais em src/.
 */

const SRC = join(import.meta.dirname, '../../..');
const CODE = /readonly code = '([A-Z_]+)'/g;

function codesInSource(): Set<string> {
  const codes = new Set<string>();
  for (const path of readdirSync(SRC, { recursive: true, encoding: 'utf8' })) {
    if (!path.endsWith('.ts') || path.endsWith('.spec.ts')) continue;
    for (const match of readFileSync(join(SRC, path), 'utf8').matchAll(CODE)) {
      codes.add(match[1]!);
    }
  }
  return codes;
}

describe('ERROR_STATUS (D58)', () => {
  it('E5: cobre todos os códigos de src/ e só eles', () => {
    const source = codesInSource();
    const table = new Set(Object.keys(ERROR_STATUS));

    // Sanidade: a varredura encontrou os erros conhecidos.
    expect(source).toContain('TOO_LATE');
    expect(source).toContain('WALLET_VERSION_CONFLICT');

    expect(
      [...source].filter((code) => !table.has(code)),
      'códigos sem status na tabela',
    ).toEqual([]);
    expect(
      [...table].filter((code) => !source.has(code)),
      'códigos da tabela que não existem em src/',
    ).toEqual([]);
  });

  it('EC1: os códigos 4xx são exatamente os CLIENT_ERROR_CODES do @crash/shared', () => {
    const clientErrors = Object.entries(ERROR_STATUS)
      .filter(([, status]) => status < 500)
      .map(([code]) => code)
      .sort();

    expect([...CLIENT_ERROR_CODES].sort()).toEqual(clientErrors);
  });

  it('usa só os status previstos na D58', () => {
    for (const [code, status] of Object.entries(ERROR_STATUS)) {
      expect([400, 401, 404, 409, 422, 500], code).toContain(status);
    }
  });
});
