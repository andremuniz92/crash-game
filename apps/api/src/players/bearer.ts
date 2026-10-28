import { TOKEN_PATTERN } from './player-token.js';

/** Token de `Authorization: Bearer <token>`, ou null se faltar ou estiver malformado. */
export function parseBearer(header: string | undefined): string | null {
  const match = /^Bearer (\S+)$/.exec(header ?? '');
  const token = match?.[1];
  return token !== undefined && TOKEN_PATTERN.test(token) ? token : null;
}
