/*
 * Contrato do WebSocket (seção 8.2): servidor → cliente, sempre no formato
 * { type, payload, serverTime }. Dinheiro em centavos, multiplicadores ×100,
 * instantes em ms (D63). Nenhuma mensagem anterior ao crash tem campo para
 * crashPoint, crashAt ou serverSeed (D30).
 */

interface WsEnvelope<TType extends string, TPayload> {
  type: TType;
  payload: TPayload;
  serverTime: number;
}

export type RoundBettingMessage = WsEnvelope<
  'round:betting',
  { roundId: string; seedHash: string; bettingEndsAt: number }
>;

export type RoundStartedMessage = WsEnvelope<
  'round:started',
  { roundId: string; startedAt: number }
>;

/** Só para sincronizar; o cliente calcula o multiplicador a cada frame (D11, D68). */
export type RoundTickMessage = WsEnvelope<
  'round:tick',
  { roundId: string; multiplier: number }
>;

export type RoundCrashedMessage = WsEnvelope<
  'round:crashed',
  { roundId: string; crashPoint: number; serverSeed: string }
>;

export type BetPlacedMessage = WsEnvelope<
  'bet:placed',
  { roundId: string; nickname: string; amount: number }
>;

export type BetCashedOutMessage = WsEnvelope<
  'bet:cashed_out',
  { roundId: string; nickname: string; multiplier: number; payout: number }
>;

export type WsMessage =
  | RoundBettingMessage
  | RoundStartedMessage
  | RoundTickMessage
  | RoundCrashedMessage
  | BetPlacedMessage
  | BetCashedOutMessage;

export type WsMessageType = WsMessage['type'];
