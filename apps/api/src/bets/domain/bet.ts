import { MAX_BET_CENTS, MIN_BET_CENTS } from '@crash/shared';
import { AggregateRoot } from '../../shared/domain/aggregate-root.js';
import { DomainError } from '../../shared/domain/domain-error.js';
import type { Money } from '../../shared/domain/money.js';
import type { Multiplier } from '../../shared/domain/multiplier.js';
import type { BetEvent } from './bet-events.js';
import type { RoundView } from './round-view.js';

export class RoundNotAcceptingBetsError extends DomainError {
  readonly code = 'ROUND_NOT_ACCEPTING_BETS';
}

export class InvalidBetAmountError extends DomainError {
  readonly code = 'INVALID_BET_AMOUNT';
}

export class RoundNotRunningError extends DomainError {
  readonly code = 'ROUND_NOT_RUNNING';
}

export class TooLateError extends DomainError {
  readonly code = 'TOO_LATE';
}

export class BetNotPendingError extends DomainError {
  readonly code = 'BET_NOT_PENDING';
}

export class BetRoundMismatchError extends DomainError {
  readonly code = 'BET_ROUND_MISMATCH';
}

export type BetStatus = 'PENDING' | 'CASHED_OUT' | 'LOST';

/**
 * Aposta de um jogador numa rodada (seção 6.3). Recebe `now` da aplicação
 * (D29) e consulta a rodada pela interface `RoundView` (D32).
 */
export class Bet extends AggregateRoot<BetEvent> {
  private _status: BetStatus = 'PENDING';
  private _cashoutMultiplier: Multiplier | null = null;
  private _payout: Money | null = null;

  private constructor(
    readonly id: string,
    readonly roundId: string,
    readonly playerId: string,
    readonly amount: Money,
  ) {
    super();
  }

  static place(props: {
    id: string;
    round: RoundView;
    playerId: string;
    amount: Money;
    now: number;
  }): Bet {
    const { cents } = props.amount;
    if (cents < MIN_BET_CENTS || cents > MAX_BET_CENTS) {
      throw new InvalidBetAmountError(
        `a aposta deve ficar entre ${MIN_BET_CENTS} e ${MAX_BET_CENTS} centavos, recebido ${cents}`,
      );
    }
    if (!props.round.acceptsBetsAt(props.now)) {
      throw new RoundNotAcceptingBetsError('a rodada não aceita apostas agora');
    }
    const bet = new Bet(props.id, props.round.id, props.playerId, props.amount);
    bet.record({
      type: 'BetPlaced',
      betId: bet.id,
      roundId: bet.roundId,
      playerId: bet.playerId,
      amount: bet.amount,
    });
    return bet;
  }

  get status(): BetStatus {
    return this._status;
  }

  get cashoutMultiplier(): Multiplier | null {
    return this._cashoutMultiplier;
  }

  get payout(): Money | null {
    return this._payout;
  }

  /** O multiplicador vem da rodada, calculado pelo servidor; o cliente nunca o informa. */
  cashOut({ round, now }: { round: RoundView; now: number }): void {
    this.assertBelongsTo(round);
    this.assertPending();
    if (round.status === 'BETTING') {
      throw new RoundNotRunningError('a rodada ainda não começou');
    }
    if (!round.acceptsCashOutAt(now)) {
      throw new TooLateError('a rodada já crashou');
    }
    const multiplier = round.multiplierAt(now);
    this._status = 'CASHED_OUT';
    this._cashoutMultiplier = multiplier;
    this._payout = this.amount.multiply(multiplier);
    this.record({
      type: 'BetCashedOut',
      betId: this.id,
      roundId: this.roundId,
      playerId: this.playerId,
      multiplier,
      payout: this._payout,
    });
  }

  lose(): void {
    this.assertPending();
    this._status = 'LOST';
  }

  assertBelongsTo(round: RoundView): void {
    if (round.id !== this.roundId) {
      throw new BetRoundMismatchError(
        `a aposta ${this.id} é da rodada ${this.roundId}, não da ${round.id}`,
      );
    }
  }

  private assertPending(): void {
    if (this._status !== 'PENDING') {
      throw new BetNotPendingError(`a aposta ${this.id} está ${this._status}`);
    }
  }
}
