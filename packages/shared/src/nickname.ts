/** Limites do nickname, para a api e o formulário do front (D59, D72). */
export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 16;

/**
 * Só letras ASCII, dígitos, _ e -: o nickname é transmitido a todos pelo WS.
 * Sem a flag `g`, o `test` não guarda `lastIndex` entre chamadas.
 */
export const NICKNAME_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]{${NICKNAME_MIN_LENGTH},${NICKNAME_MAX_LENGTH}}$`,
);

/** O nickname aparado, se for válido; senão, null. */
export function parseNickname(raw: string): string | null {
  const nickname = raw.trim();
  return NICKNAME_PATTERN.test(nickname) ? nickname : null;
}
