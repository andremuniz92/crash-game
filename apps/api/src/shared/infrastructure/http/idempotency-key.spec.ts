import {
  IdempotencyKeyRequiredError,
  InvalidIdempotencyKeyError,
  parseIdempotencyKey,
} from './idempotency-key.js';

const KEY = 'c5c5c5c5-0000-4000-8000-00000000000a';

describe('parseIdempotencyKey (D60)', () => {
  it('HK1: aceita UUID e normaliza para minúsculas', () => {
    expect(parseIdempotencyKey(KEY)).toBe(KEY);
    expect(parseIdempotencyKey(KEY.toUpperCase())).toBe(KEY);
  });

  it.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['só espaços', '   '],
  ])('HK1: %s responde IDEMPOTENCY_KEY_REQUIRED', (_case, header) => {
    expect(() => parseIdempotencyKey(header)).toThrow(
      IdempotencyKeyRequiredError,
    );
  });

  it.each([
    ['texto', 'abc'],
    ['sem hífens', KEY.replaceAll('-', '')],
    ['header repetido', [KEY, KEY]],
  ])('HK1: %s responde INVALID_IDEMPOTENCY_KEY', (_case, header) => {
    expect(() => parseIdempotencyKey(header)).toThrow(
      InvalidIdempotencyKeyError,
    );
  });
});
