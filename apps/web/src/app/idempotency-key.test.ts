import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIdempotencyKey } from './idempotency-key.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Preenche todos os bytes com o mesmo valor. */
const filledWith = (value: number) => (bytes: Uint8Array<ArrayBuffer>) => {
  bytes.fill(value);
};

const SRC = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe('createIdempotencyKey (D96)', () => {
  it('IK1: UUID v4 canônico, sem repetir em 1000 chaves', () => {
    const keys = Array.from({ length: 1000 }, () => createIdempotencyKey());
    for (const key of keys) expect(key).toMatch(UUID_V4);
    expect(new Set(keys).size).toBe(1000);
  });

  it('IK2: funciona sem crypto.randomUUID (contexto inseguro)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array<ArrayBuffer>) =>
        real.getRandomValues(bytes),
    });
    expect(createIdempotencyKey()).toMatch(UUID_V4);
  });

  it('IK3: força os bits de versão e de variante da RFC 9562', () => {
    expect(createIdempotencyKey(filledWith(0x00))).toBe(
      '00000000-0000-4000-8000-000000000000',
    );
    expect(createIdempotencyKey(filledWith(0xff))).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    );
  });

  it('IK4: pede 16 bytes novos a cada chave', () => {
    let next = 0;
    const getRandomValues = vi.fn((bytes: Uint8Array<ArrayBuffer>) => {
      bytes.fill(next++);
    });
    const first = createIdempotencyKey(getRandomValues);
    const second = createIdempotencyKey(getRandomValues);

    expect(getRandomValues).toHaveBeenCalledTimes(2);
    for (const [bytes] of getRandomValues.mock.calls) {
      expect(bytes).toHaveLength(16);
    }
    expect(first).not.toBe(second);
  });

  it('IK5: nenhuma chamada a randomUUID no código do front', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => /randomUUID\s*\(/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
