import { multiplierAt, timeToCrash } from '@crash/shared';
import { AggregateRoot } from '../../shared/domain/aggregate-root.js';
import { DomainError } from '../../shared/domain/domain-error.js';
import { Multiplier } from '../../shared/domain/multiplier.js';
import { crashPointFor } from './crash-point.js';
import type { RoundEvent } from './round-events.js';
import type { SeedHash } from './seed-hash.js';
import type { ServerSeed } from './server-seed.js';

export class InvalidRoundTransitionError extends DomainError {
  readonly code = 'INVALID_ROUND_TRANSITION';
}

export class BettingWindowOpenError extends DomainError {
  readonly code = 'BETTING_WINDOW_OPEN';
}

export class CrashBeforeCrashAtError extends DomainError {
  readonly code = 'CRASH_BEFORE_CRASH_AT';
}

export class RoundNotRunningError extends DomainError {
  readonly code = 'ROUND_NOT_RUNNING';
}

export class SecretNotRevealedError extends DomainError {
  readonly code = 'SECRET_NOT_REVEALED';
}

export type RoundStatus = 'BETTING' | 'RUNNING' | 'CRASHED';

/**
 * Rodada global (seção 6.2): BETTING → RUNNING → CRASHED.
 *
 * serverSeed, crashPoint e crashAt ficam em campos privados e só saem
 * depois do crash (D30). Os métodos recebem `now` da aplicação (D29).
 */
export class Round extends AggregateRoot<RoundEvent> {
  readonly seedHash: SeedHash;
  readonly #serverSeed: ServerSeed;
  readonly #crashPoint: Multiplier;
  #crashAt: number | null = null;
  private _status: RoundStatus = 'BETTING';
  private _startedAt: number | null = null;
  private _crashedAt: number | null = null;

  private constructor(
    readonly id: string,
    serverSeed: ServerSeed,
    readonly bettingEndsAt: number,
  ) {
    super();
    this.#serverSeed = serverSeed;
    this.#crashPoint = crashPointFor(serverSeed, id);
    this.seedHash = serverSeed.hash();
  }

  static create(props: {
    id: string;
    serverSeed: ServerSeed;
    bettingEndsAt: number;
  }): Round {
    const round = new Round(props.id, props.serverSeed, props.bettingEndsAt);
    round.record({
      type: 'RoundCreated',
      roundId: round.id,
      seedHash: round.seedHash,
      bettingEndsAt: round.bettingEndsAt,
    });
    return round;
  }

  get status(): RoundStatus {
    return this._status;
  }

  get startedAt(): number | null {
    return this._startedAt;
  }

  get crashedAt(): number | null {
    return this._crashedAt;
  }

  start(now: number): void {
    this.assertTransition('BETTING', 'RUNNING');
    if (now < this.bettingEndsAt) {
      throw new BettingWindowOpenError(
        `a janela de apostas só fecha em ${this.bettingEndsAt}`,
      );
    }
    this._status = 'RUNNING';
    this._startedAt = now;
    this.#crashAt = now + timeToCrash(this.#crashPoint.x100);
    this.record({ type: 'RoundStarted', roundId: this.id, startedAt: now });
  }

  crash(now: number): void {
    this.assertTransition('RUNNING', 'CRASHED');
    if (now < this.crashAt()) {
      throw new CrashBeforeCrashAtError('a rodada ainda não chegou ao crash');
    }
    this._status = 'CRASHED';
    this._crashedAt = now;
    this.record({
      type: 'RoundCrashed',
      roundId: this.id,
      crashPoint: this.#crashPoint,
      serverSeed: this.#serverSeed,
      crashedAt: now,
    });
  }

  /** Nunca passa do crash point (seção 6.2). */
  multiplierAt(now: number): Multiplier {
    if (this._status !== 'RUNNING') {
      throw new RoundNotRunningError('a rodada não está em andamento');
    }
    const x100 = multiplierAt(now - this.startedAtOrFail());
    return Multiplier.fromX100(Math.min(x100, this.#crashPoint.x100));
  }

  acceptsBetsAt(now: number): boolean {
    return this._status === 'BETTING' && now < this.bettingEndsAt;
  }

  acceptsCashOutAt(now: number): boolean {
    return this._status === 'RUNNING' && now < this.crashAt();
  }

  revealServerSeed(): ServerSeed {
    this.assertCrashed();
    return this.#serverSeed;
  }

  revealCrashPoint(): Multiplier {
    this.assertCrashed();
    return this.#crashPoint;
  }

  private assertTransition(from: RoundStatus, to: RoundStatus): void {
    if (this._status !== from) {
      throw new InvalidRoundTransitionError(
        `transição inválida: ${this._status} → ${to}`,
      );
    }
  }

  private assertCrashed(): void {
    if (this._status !== 'CRASHED') {
      throw new SecretNotRevealedError('só é revelado depois do crash');
    }
  }

  private startedAtOrFail(): number {
    if (this._startedAt === null) {
      throw new RoundNotRunningError('a rodada ainda não começou');
    }
    return this._startedAt;
  }

  private crashAt(): number {
    if (this.#crashAt === null) {
      throw new RoundNotRunningError('a rodada ainda não começou');
    }
    return this.#crashAt;
  }
}
