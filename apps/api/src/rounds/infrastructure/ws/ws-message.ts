import type { WsMessage } from '@crash/shared';
import type { BetEvent, BetsSettled } from '../../../bets/domain/bet-events.js';
import type { PublishedEvent } from '../../../shared/application/event-publisher.js';
import type { RoundEvent } from '../../domain/round-events.js';

/** Os eventos de domínio que podem virar mensagem do WS (seção 6.5). */
export type BroadcastEvent = RoundEvent | BetEvent | BetsSettled;

const BROADCAST_TYPES = new Set<string>([
  'RoundCreated',
  'RoundStarted',
  'RoundCrashed',
  'BetPlaced',
  'BetCashedOut',
  'BetsSettled',
] satisfies BroadcastEvent['type'][]);

export function isBroadcastEvent(
  event: PublishedEvent,
): event is BroadcastEvent {
  return BROADCAST_TYPES.has(event.type);
}

/**
 * Evento de domínio → mensagem da seção 8.2. Converte os VOs para o contrato:
 * hex, ×100 e centavos. `BetsSettled` não tem mensagem. Antes do crash,
 * nenhuma mensagem tem campo para crashPoint, crashAt ou serverSeed (D30).
 */
export function toWsMessage(
  event: BroadcastEvent,
  { serverTime, nickname }: { serverTime: number; nickname?: string },
): WsMessage | null {
  switch (event.type) {
    case 'RoundCreated':
      return {
        type: 'round:betting',
        payload: {
          roundId: event.roundId,
          seedHash: event.seedHash.toHex(),
          bettingEndsAt: event.bettingEndsAt,
        },
        serverTime,
      };
    case 'RoundStarted':
      return {
        type: 'round:started',
        payload: { roundId: event.roundId, startedAt: event.startedAt },
        serverTime,
      };
    case 'RoundCrashed':
      return {
        type: 'round:crashed',
        payload: {
          roundId: event.roundId,
          crashPoint: event.crashPoint.x100,
          serverSeed: event.serverSeed.toHex(),
        },
        serverTime,
      };
    case 'BetPlaced':
      return {
        type: 'bet:placed',
        payload: {
          roundId: event.roundId,
          nickname: required(nickname),
          amount: event.amount.cents,
        },
        serverTime,
      };
    case 'BetCashedOut':
      return {
        type: 'bet:cashed_out',
        payload: {
          roundId: event.roundId,
          nickname: required(nickname),
          multiplier: event.multiplier.x100,
          payout: event.payout.cents,
        },
        serverTime,
      };
    case 'BetsSettled':
      return null;
  }
}

/** O broadcaster sempre resolve o nickname dos eventos de aposta. */
function required(nickname: string | undefined): string {
  if (nickname === undefined) {
    throw new Error('evento de aposta sem nickname resolvido');
  }
  return nickname;
}
