import {
  type GuestRequest,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  parseNickname,
} from '@crash/shared';
import { InvalidRequestError } from '../shared/infrastructure/http/request-errors.js';

/** As regras do nickname vêm do `@crash/shared`, as mesmas do formulário (D59, D72). */
export function parseGuestBody(body: unknown): GuestRequest {
  const raw =
    typeof body === 'object' && body !== null && 'nickname' in body
      ? body.nickname
      : undefined;
  const nickname = typeof raw === 'string' ? parseNickname(raw) : null;
  if (nickname === null) {
    throw new InvalidRequestError(
      `nickname deve ter de ${NICKNAME_MIN_LENGTH} a ${NICKNAME_MAX_LENGTH} caracteres entre letras sem acento, dígitos, _ e -`,
    );
  }
  return { nickname };
}
