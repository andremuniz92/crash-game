import type { GuestRequest } from '@crash/shared';
import { InvalidRequestError } from '../shared/infrastructure/http/request-errors.js';

/** O nickname é transmitido a todos pelo WS: só letras ASCII, dígitos, _ e - (D59). */
const NICKNAME = /^[A-Za-z0-9_-]{3,16}$/;

export function parseGuestBody(body: unknown): GuestRequest {
  const raw =
    typeof body === 'object' && body !== null && 'nickname' in body
      ? body.nickname
      : undefined;
  const nickname = typeof raw === 'string' ? raw.trim() : undefined;
  if (nickname === undefined || !NICKNAME.test(nickname)) {
    throw new InvalidRequestError(
      'nickname deve ter de 3 a 16 caracteres entre letras sem acento, dígitos, _ e -',
    );
  }
  return { nickname };
}
