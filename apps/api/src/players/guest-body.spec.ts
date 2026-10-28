import { InvalidRequestError } from '../shared/infrastructure/http/request-errors.js';
import { parseGuestBody } from './guest-body.js';

describe('parseGuestBody (D59)', () => {
  it('N1: apara o nickname e aceita os limites, com _ e -', () => {
    expect(parseGuestBody({ nickname: '  andre_1 ' })).toEqual({
      nickname: 'andre_1',
    });
    expect(parseGuestBody({ nickname: 'a-b' }).nickname).toBe('a-b');
    expect(parseGuestBody({ nickname: 'A'.repeat(16) }).nickname).toBe(
      'A'.repeat(16),
    );
  });

  it.each([
    ['corpo ausente', undefined],
    ['corpo nulo', null],
    ['campo ausente', {}],
    ['valor que não é string', { nickname: 123 }],
    ['2 caracteres', { nickname: 'ab' }],
    ['17 caracteres', { nickname: 'a'.repeat(17) }],
    ['só espaços', { nickname: '     ' }],
    ['espaço no meio', { nickname: 'a b' }],
    ['acento', { nickname: 'joão' }],
    ['html', { nickname: '<script>' }],
    ['emoji', { nickname: 'abc😀' }],
  ])('N2: recusa %s', (_case, body) => {
    const parse = () => parseGuestBody(body);
    expect(parse).toThrow(InvalidRequestError);
    expect(parse).toThrow(/nickname/);
  });
});
