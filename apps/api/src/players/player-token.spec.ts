import { createHash } from 'node:crypto';
import { generateToken, hashToken, TOKEN_PATTERN } from './player-token.js';

describe('token do jogador (D59)', () => {
  it('T1: gera 43 caracteres base64url, diferentes a cada chamada', () => {
    const tokens = Array.from({ length: 100 }, () => generateToken());
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(token).toMatch(TOKEN_PATTERN);
    }
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('T1: hashToken é o SHA-256 em hex, determinístico e diferente por token', () => {
    const token = generateToken();
    const expected = createHash('sha256').update(token, 'utf8').digest('hex');

    expect(hashToken(token)).toBe(expected);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(generateToken())).not.toBe(hashToken(token));
  });
});
