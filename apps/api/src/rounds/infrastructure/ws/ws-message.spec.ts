import { Money } from '../../../shared/domain/money.js';
import { Multiplier } from '../../../shared/domain/multiplier.js';
import { ServerSeed } from '../../domain/server-seed.js';
import { isBroadcastEvent, toWsMessage } from './ws-message.js';

const SEED = ServerSeed.fromHex(
  '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad',
);
const ROUND = '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60';
const BET = 'b7b7b7b7-0000-4000-8000-000000000001';
const PLAYER = 'a7a7a7a7-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-10-28T12:00:00.000Z');

describe('toWsMessage (seção 8.2)', () => {
  it('W1: traduz cada evento para o type e o payload exatos', () => {
    const at = { serverTime: NOW };
    const withNickname = { serverTime: NOW, nickname: 'ana' };

    expect(
      toWsMessage(
        {
          type: 'RoundCreated',
          roundId: ROUND,
          seedHash: SEED.hash(),
          bettingEndsAt: NOW + 10_000,
        },
        at,
      ),
    ).toEqual({
      type: 'round:betting',
      payload: {
        roundId: ROUND,
        seedHash: SEED.hash().toHex(),
        bettingEndsAt: NOW + 10_000,
      },
      serverTime: NOW,
    });
    expect(
      toWsMessage({ type: 'RoundStarted', roundId: ROUND, startedAt: NOW }, at),
    ).toEqual({
      type: 'round:started',
      payload: { roundId: ROUND, startedAt: NOW },
      serverTime: NOW,
    });
    expect(
      toWsMessage(
        {
          type: 'RoundCrashed',
          roundId: ROUND,
          crashPoint: Multiplier.fromX100(126),
          serverSeed: SEED,
          crashedAt: NOW,
        },
        at,
      ),
    ).toEqual({
      type: 'round:crashed',
      payload: { roundId: ROUND, crashPoint: 126, serverSeed: SEED.toHex() },
      serverTime: NOW,
    });
    expect(
      toWsMessage(
        {
          type: 'BetPlaced',
          betId: BET,
          roundId: ROUND,
          playerId: PLAYER,
          amount: Money.fromCents(2_500),
        },
        withNickname,
      ),
    ).toEqual({
      type: 'bet:placed',
      payload: { roundId: ROUND, betId: BET, nickname: 'ana', amount: 2_500 },
      serverTime: NOW,
    });
    expect(
      toWsMessage(
        {
          type: 'BetCashedOut',
          betId: BET,
          roundId: ROUND,
          playerId: PLAYER,
          multiplier: Multiplier.fromX100(182),
          payout: Money.fromCents(4_550),
        },
        withNickname,
      ),
    ).toEqual({
      type: 'bet:cashed_out',
      payload: {
        roundId: ROUND,
        betId: BET,
        nickname: 'ana',
        multiplier: 182,
        payout: 4_550,
      },
      serverTime: NOW,
    });
    expect(
      toWsMessage(
        { type: 'BetsSettled', roundId: ROUND, lostBetIds: [BET] },
        at,
      ),
    ).toBeNull();
  });

  it('W2: round:betting e round:started não têm campos de segredo nem a seed', () => {
    const messages = [
      toWsMessage(
        {
          type: 'RoundCreated',
          roundId: ROUND,
          seedHash: SEED.hash(),
          bettingEndsAt: NOW,
        },
        { serverTime: NOW },
      ),
      toWsMessage(
        { type: 'RoundStarted', roundId: ROUND, startedAt: NOW },
        { serverTime: NOW },
      ),
    ];
    for (const message of messages) {
      const text = JSON.stringify(message);
      for (const key of ['crashPoint', 'crashAt', 'serverSeed']) {
        expect(text).not.toContain(`"${key}"`);
      }
      expect(text).not.toContain(SEED.toHex());
    }
  });

  it('B1: eventos de aposta levam o betId e nunca o playerId (D71)', () => {
    const withNickname = { serverTime: NOW, nickname: 'ana' };
    const messages = [
      toWsMessage(
        {
          type: 'BetPlaced',
          betId: BET,
          roundId: ROUND,
          playerId: PLAYER,
          amount: Money.fromCents(2_500),
        },
        withNickname,
      ),
      toWsMessage(
        {
          type: 'BetCashedOut',
          betId: BET,
          roundId: ROUND,
          playerId: PLAYER,
          multiplier: Multiplier.fromX100(182),
          payout: Money.fromCents(4_550),
        },
        withNickname,
      ),
    ];
    for (const message of messages) {
      expect(message?.payload).toHaveProperty('betId', BET);
      expect(message?.payload).not.toHaveProperty('playerId');
      expect(JSON.stringify(message)).not.toContain(PLAYER);
    }
  });

  it('W1: evento de aposta sem nickname é bug e lança', () => {
    expect(() =>
      toWsMessage(
        {
          type: 'BetPlaced',
          betId: BET,
          roundId: ROUND,
          playerId: PLAYER,
          amount: Money.fromCents(100),
        },
        { serverTime: NOW },
      ),
    ).toThrow(/nickname/);
  });
});

describe('isBroadcastEvent', () => {
  it('W1: reconhece os eventos de domínio da seção 6.5 e recusa os outros', () => {
    for (const type of [
      'RoundCreated',
      'RoundStarted',
      'RoundCrashed',
      'BetPlaced',
      'BetCashedOut',
      'BetsSettled',
    ]) {
      expect(isBroadcastEvent({ type }), type).toBe(true);
    }
    expect(isBroadcastEvent({ type: 'OutroEvento' })).toBe(false);
  });
});
