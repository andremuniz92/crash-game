import type { WsMessage, WsMessageType } from '@crash/shared';

const TYPES = new Set<string>([
  'round:betting',
  'round:started',
  'round:tick',
  'round:crashed',
  'bet:placed',
  'bet:cashed_out',
] satisfies WsMessageType[]);

/**
 * Mensagem do servidor (seção 8.2), ou null se não for uma: JSON inválido ou
 * `type` desconhecido não podem derrubar a conexão (D76). Confere o envelope;
 * o payload vem do servidor, que é autoritativo (D3).
 */
export function parseWsMessage(text: string): WsMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    TYPES.has(value.type) &&
    'payload' in value &&
    typeof value.payload === 'object' &&
    value.payload !== null &&
    'serverTime' in value &&
    typeof value.serverTime === 'number' &&
    Number.isFinite(value.serverTime)
  ) {
    return value as WsMessage;
  }
  return null;
}
