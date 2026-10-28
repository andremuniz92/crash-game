import { parseBearer } from './bearer.js';

describe('parseBearer (D59)', () => {
  // 43 caracteres base64url, com _ e - para cobrir o alfabeto inteiro.
  const token = `${'A'.repeat(20)}_-${'z9'.repeat(10)}a`;

  it('B1: extrai o token de "Bearer <token>"', () => {
    expect(parseBearer(`Bearer ${token}`)).toBe(token);
  });

  it.each([
    ['header ausente', undefined],
    ['header vazio', ''],
    ['outro esquema', `Basic ${token}`],
    ['Bearer sem token', 'Bearer '],
    ['dois tokens', `Bearer ${token} ${token}`],
    ['token curto', 'Bearer abc'],
    ['token com caractere fora do base64url', `Bearer ${token.slice(1)}+`],
  ])('B1: devolve null para %s', (_case, header) => {
    expect(parseBearer(header)).toBeNull();
  });
});
