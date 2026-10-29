import type { WsMessage } from '@crash/shared';
import { describe, expect, it } from 'vitest';
import { parseWsMessage } from './ws-message.js';

const ROUND = '00000000-0000-4000-8000-0000000000a1';
const BET = 'b0b0b0b0-0000-4000-8000-000000000001';
const T0 = 1_800_000_000_000;

const valid: WsMessage[] = [
  {
    type: 'round:betting',
    payload: { roundId: ROUND, seedHash: 'h'.repeat(64), bettingEndsAt: T0 },
    serverTime: T0,
  },
  {
    type: 'round:started',
    payload: { roundId: ROUND, startedAt: T0 },
    serverTime: T0,
  },
  {
    type: 'round:tick',
    payload: { roundId: ROUND, multiplier: 150 },
    serverTime: T0,
  },
  {
    type: 'round:crashed',
    payload: { roundId: ROUND, crashPoint: 235, serverSeed: 's'.repeat(64) },
    serverTime: T0,
  },
  {
    type: 'bet:placed',
    payload: { roundId: ROUND, betId: BET, nickname: 'ana', amount: 1_000 },
    serverTime: T0,
  },
  {
    type: 'bet:cashed_out',
    payload: {
      roundId: ROUND,
      betId: BET,
      nickname: 'ana',
      multiplier: 182,
      payout: 1_820,
    },
    serverTime: T0,
  },
];

describe('parseWsMessage (seção 8.2)', () => {
  it.each(valid.map((message) => [message.type, message] as const))(
    'PM1: %s bem formada é devolvida como está',
    (_type, message) => {
      expect(parseWsMessage(JSON.stringify(message))).toEqual(message);
    },
  );

  it.each([
    ['JSON inválido', '{oops'],
    ['número', '42'],
    ['null', 'null'],
    ['lista', '[]'],
    [
      'type desconhecido',
      JSON.stringify({ type: 'round:paused', payload: {}, serverTime: T0 }),
    ],
    ['sem type', JSON.stringify({ payload: {}, serverTime: T0 })],
    ['sem payload', JSON.stringify({ type: 'round:tick', serverTime: T0 })],
    [
      'payload null',
      JSON.stringify({ type: 'round:tick', payload: null, serverTime: T0 }),
    ],
    [
      'serverTime texto',
      JSON.stringify({ type: 'round:tick', payload: {}, serverTime: '1' }),
    ],
    ['sem serverTime', JSON.stringify({ type: 'round:tick', payload: {} })],
  ])('PM2: %s devolve null', (_case, text) => {
    expect(parseWsMessage(text)).toBeNull();
  });
});
