import { describe, expect, it } from 'vitest';
import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  NICKNAME_PATTERN,
  parseNickname,
} from './nickname.js';

describe('parseNickname (D59, D72)', () => {
  it('K1: apara e aceita letras sem acento, dígitos, _ e -, de 3 a 16 caracteres', () => {
    expect(parseNickname('  andre_1 ')).toBe('andre_1');
    expect(parseNickname('a-b')).toBe('a-b');
    expect(parseNickname('abc')).toBe('abc');
    expect(parseNickname('A'.repeat(16))).toBe('A'.repeat(16));
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['2 caracteres', 'ab'],
    ['17 caracteres', 'a'.repeat(17)],
    ['espaço no meio', 'a b'],
    ['quebra de linha no meio', 'ab\ncd'],
    ['acento', 'joão'],
    ['html', '<script>'],
    ['emoji', 'abc😀'],
    ['2 caracteres depois de aparar', ' ab '],
  ])('K2: recusa %s', (_case, raw) => {
    expect(parseNickname(raw)).toBeNull();
  });

  it('K3: apara antes de medir o tamanho', () => {
    expect(parseNickname(` ${'a'.repeat(16)} `)).toBe('a'.repeat(16));
  });

  it('K4: os limites são 3 e 16, para o formulário do front e a mensagem de erro', () => {
    expect(NICKNAME_MIN_LENGTH).toBe(3);
    expect(NICKNAME_MAX_LENGTH).toBe(16);
  });

  it('K5: chamadas seguidas não guardam estado no regex', () => {
    expect(parseNickname('ana')).toBe('ana');
    expect(parseNickname('ana')).toBe('ana');
    expect(NICKNAME_PATTERN.test('ana')).toBe(true);
    expect(NICKNAME_PATTERN.test('ana')).toBe(true);
  });
});
