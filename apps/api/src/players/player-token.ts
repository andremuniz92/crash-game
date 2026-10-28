import { createHash, randomBytes } from 'node:crypto';

/** 32 bytes em base64url, sem padding (D59). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Token opaco do guest; só o cliente o guarda em texto puro. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** O que vai para `players.token_hash`. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
