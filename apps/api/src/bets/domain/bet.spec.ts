import { MAX_BET_CENTS, MIN_BET_CENTS } from '@crash/shared';
import { Money } from '../../shared/domain/money.js';
import { Round } from '../../rounds/domain/round.js';
import { ServerSeed } from '../../rounds/domain/server-seed.js';
import {
  Bet,
  BetNotPendingError,
  BetRoundMismatchError,
  InvalidBetAmountError,
  RoundNotAcceptingBetsError,
  RoundNotRunningError,
  TooLateError,
} from './bet.js';
import { RoundNotCrashedError, settleBets } from './settle-bets.js';

/* Vetores da Fase 2: 15,85x (crash em 46.053 ms) e 1,26x (crash em 3.852 ms). */
const HIGH = {
  seed: 'dabbdcfa82ee4f2e349ef253955ca74a8cdc6abde9f63f87840a9659bf665921',
  roundId: '11111111-2222-4333-8444-000000000004',
  timeToCrash: 46_053,
};
const LOW = {
  seed: '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad',
  roundId: '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60',
  timeToCrash: 3_852,
};

const BETTING_ENDS_AT = 1_700_000_010_000;
const STARTED_AT = BETTING_ENDS_AT;
const CRASH_AT = STARTED_AT + HIGH.timeToCrash;
const PLACED_AT = BETTING_ENDS_AT - 5_000;

function bettingRound(vector = HIGH): Round {
  return Round.create({
    id: vector.roundId,
    serverSeed: ServerSeed.fromHex(vector.seed),
    bettingEndsAt: BETTING_ENDS_AT,
  });
}

let betCounter = 0;
function placeBet(round: Round, cents = 1_001, playerId = 'player-1'): Bet {
  betCounter++;
  return Bet.place({
    id: `bet-${betCounter}`,
    round,
    playerId,
    amount: Money.fromCents(cents),
    now: PLACED_AT,
  });
}

/** Rodada HIGH com uma aposta feita na janela e a rodada já em andamento. */
function runningRoundWithBet(): { round: Round; bet: Bet } {
  const round = bettingRound();
  const bet = placeBet(round);
  round.start(STARTED_AT);
  bet.pullEvents();
  return { round, bet };
}

describe('Bet', () => {
  describe('place', () => {
    it('cria a aposta PENDING numa rodada aceitando apostas e registra BetPlaced', () => {
      const round = bettingRound();
      const bet = Bet.place({
        id: 'bet-a',
        round,
        playerId: 'player-1',
        amount: Money.fromCents(1_001),
        now: PLACED_AT,
      });

      expect(bet.id).toBe('bet-a');
      expect(bet.roundId).toBe(HIGH.roundId);
      expect(bet.playerId).toBe('player-1');
      expect(bet.amount.cents).toBe(1_001);
      expect(bet.status).toBe('PENDING');
      expect(bet.cashoutMultiplier).toBeNull();
      expect(bet.payout).toBeNull();
      expect(bet.pullEvents()).toEqual([
        {
          type: 'BetPlaced',
          betId: 'bet-a',
          roundId: HIGH.roundId,
          playerId: 'player-1',
          amount: Money.fromCents(1_001),
        },
      ]);
    });

    it('rejeita com RoundNotAcceptingBetsError no fim da janela ou com a rodada em andamento', () => {
      const round = bettingRound();
      const at = (now: number) => () =>
        Bet.place({
          id: 'bet-x',
          round,
          playerId: 'player-1',
          amount: Money.fromCents(1_000),
          now,
        });

      expect(at(BETTING_ENDS_AT)).toThrow(RoundNotAcceptingBetsError);
      round.start(STARTED_AT);
      expect(at(PLACED_AT)).toThrow(RoundNotAcceptingBetsError);
    });

    it('aceita os limites de 100 e 100.000 centavos e rejeita 99 e 100.001', () => {
      const round = bettingRound();
      expect(placeBet(round, MIN_BET_CENTS).amount.cents).toBe(100);
      expect(placeBet(round, MAX_BET_CENTS).amount.cents).toBe(100_000);
      expect(() => placeBet(round, MIN_BET_CENTS - 1)).toThrow(
        InvalidBetAmountError,
      );
      expect(() => placeBet(round, MAX_BET_CENTS + 1)).toThrow(
        InvalidBetAmountError,
      );
    });
  });

  describe('cashOut', () => {
    it('em RUNNING usa o multiplicador do servidor, arredonda o payout para baixo e registra BetCashedOut', () => {
      const { round, bet } = runningRoundWithBet();
      // multiplierAt(30.000 ms) = 604 (6,04x); 1001 × 6,04 = 6046,04 → 6046
      bet.cashOut({ round, now: STARTED_AT + 30_000 });

      expect(bet.status).toBe('CASHED_OUT');
      expect(bet.cashoutMultiplier?.x100).toBe(604);
      expect(bet.payout?.cents).toBe(6_046);
      const [event, ...rest] = bet.pullEvents();
      expect(rest).toHaveLength(0);
      expect(event).toMatchObject({
        type: 'BetCashedOut',
        betId: bet.id,
        roundId: HIGH.roundId,
        playerId: 'player-1',
      });
      if (event?.type !== 'BetCashedOut') throw new Error('evento inesperado');
      expect(event.multiplier.x100).toBe(604);
      expect(event.payout.cents).toBe(6_046);
    });

    it('1 ms antes do crashAt é aceito; no próprio crashAt lança TooLateError', () => {
      const accepted = runningRoundWithBet();
      accepted.bet.cashOut({ round: accepted.round, now: CRASH_AT - 1 });
      expect(accepted.bet.status).toBe('CASHED_OUT');

      const late = runningRoundWithBet();
      expect(() =>
        late.bet.cashOut({ round: late.round, now: CRASH_AT }),
      ).toThrow(TooLateError);
      expect(late.bet.status).toBe('PENDING');
    });

    it('rodada em BETTING lança RoundNotRunningError; rodada já crashada lança TooLateError', () => {
      const round = bettingRound();
      const bet = placeBet(round);
      expect(() => bet.cashOut({ round, now: PLACED_AT })).toThrow(
        RoundNotRunningError,
      );

      round.start(STARTED_AT);
      round.crash(CRASH_AT);
      expect(() => bet.cashOut({ round, now: CRASH_AT - 1 })).toThrow(
        TooLateError,
      );
    });

    it('aposta já sacada ou perdida lança BetNotPendingError', () => {
      const cashed = runningRoundWithBet();
      cashed.bet.cashOut({ round: cashed.round, now: STARTED_AT + 1_000 });
      expect(() =>
        cashed.bet.cashOut({ round: cashed.round, now: STARTED_AT + 2_000 }),
      ).toThrow(BetNotPendingError);

      const lost = runningRoundWithBet();
      lost.bet.lose();
      expect(() =>
        lost.bet.cashOut({ round: lost.round, now: STARTED_AT + 1_000 }),
      ).toThrow(BetNotPendingError);
    });

    it('rodada de outra aposta lança BetRoundMismatchError', () => {
      const { bet } = runningRoundWithBet();
      const other = bettingRound(LOW);
      other.start(STARTED_AT);
      expect(() => bet.cashOut({ round: other, now: STARTED_AT + 1 })).toThrow(
        BetRoundMismatchError,
      );
    });
  });

  describe('lose', () => {
    it('passa de PENDING a LOST; fora de PENDING lança BetNotPendingError', () => {
      const { bet } = runningRoundWithBet();
      bet.lose();
      expect(bet.status).toBe('LOST');
      expect(() => bet.lose()).toThrow(BetNotPendingError);

      const cashed = runningRoundWithBet();
      cashed.bet.cashOut({ round: cashed.round, now: STARTED_AT + 1_000 });
      expect(() => cashed.bet.lose()).toThrow(BetNotPendingError);
    });
  });

  describe('settleBets', () => {
    it('exige rodada CRASHED, marca PENDING como LOST, mantém CASHED_OUT e devolve BetsSettled', () => {
      const round = bettingRound();
      const winner = placeBet(round, 1_000, 'player-1');
      const loserA = placeBet(round, 1_000, 'player-2');
      const loserB = placeBet(round, 1_000, 'player-3');
      round.start(STARTED_AT);
      winner.cashOut({ round, now: STARTED_AT + 1_000 });

      expect(() => settleBets(round, [winner, loserA, loserB])).toThrow(
        RoundNotCrashedError,
      );

      round.crash(CRASH_AT);
      const event = settleBets(round, [winner, loserA, loserB]);

      expect(winner.status).toBe('CASHED_OUT');
      expect(loserA.status).toBe('LOST');
      expect(loserB.status).toBe('LOST');
      expect(event).toEqual({
        type: 'BetsSettled',
        roundId: HIGH.roundId,
        lostBetIds: [loserA.id, loserB.id],
      });
    });

    it('rejeita aposta de outra rodada com BetRoundMismatchError', () => {
      const { bet } = runningRoundWithBet();
      const other = bettingRound(LOW);
      other.start(STARTED_AT);
      other.crash(STARTED_AT + LOW.timeToCrash);
      expect(() => settleBets(other, [bet])).toThrow(BetRoundMismatchError);
    });
  });

  it('os erros carregam seus codes', () => {
    const code = (c: string) => expect.objectContaining({ code: c });
    const round = bettingRound();
    const bet = placeBet(round);

    // Rodada em BETTING
    expect(() => placeBet(round, 1)).toThrow(code('INVALID_BET_AMOUNT'));
    expect(() => bet.cashOut({ round, now: PLACED_AT })).toThrow(
      code('ROUND_NOT_RUNNING'),
    );
    expect(() => settleBets(round, [bet])).toThrow(code('ROUND_NOT_CRASHED'));

    // Rodada em RUNNING
    round.start(STARTED_AT);
    expect(() => placeBet(round)).toThrow(code('ROUND_NOT_ACCEPTING_BETS'));
    expect(() => bet.cashOut({ round, now: CRASH_AT })).toThrow(
      code('TOO_LATE'),
    );
    const other = bettingRound(LOW);
    other.start(STARTED_AT);
    expect(() => bet.cashOut({ round: other, now: STARTED_AT + 1 })).toThrow(
      code('BET_ROUND_MISMATCH'),
    );

    // Aposta fora de PENDING
    bet.lose();
    expect(() => bet.lose()).toThrow(code('BET_NOT_PENDING'));
  });
});
