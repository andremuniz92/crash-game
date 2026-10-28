import type {
  EventPublisher,
  PublishedEvent,
} from '../../shared/application/event-publisher.js';
import type { IdGenerator } from '../../shared/application/id-generator.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { Clock } from '../../shared/domain/clock.js';
import { Round } from '../domain/round.js';
import type { RoundRepository } from '../domain/round-repository.js';
import type { RoundSettlement } from './round-settlement.js';
import type { SeedGenerator } from './seed-generator.js';

export interface GameLoopTimings {
  bettingMs: number;
  pauseMs: number;
}

export interface GameLoopStepTx {
  rounds: RoundRepository;
  settlement: RoundSettlement;
}

export interface GameLoopStepResult {
  /** Quanto o driver espera até o próximo passo. */
  waitMs: number;
}

interface Outcome {
  waitMs: number;
  events: PublishedEvent[];
}

/**
 * Um passo do game loop (seção 10.3, D61): olha a rodada atual e faz a ação
 * devida. A recuperação no boot é só o primeiro passo: uma rodada vencida é
 * iniciada ou crashada como qualquer outra.
 *
 * Sem rodada aberta, cria uma na hora; a pausa entre rodadas é a espera que
 * o passo do crash devolve.
 */
export class GameLoopStep {
  constructor(
    private readonly uow: UnitOfWork<GameLoopStepTx>,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly seeds: SeedGenerator,
    private readonly events: EventPublisher,
    private readonly timings: GameLoopTimings,
  ) {}

  async execute(): Promise<GameLoopStepResult> {
    const now = this.clock.now();
    const { waitMs, events } = await this.uow.run((tx) =>
      this.advance(tx, now),
    );
    // Só depois do commit (D62).
    this.events.publish(events);
    return { waitMs };
  }

  private async advance(tx: GameLoopStepTx, now: number): Promise<Outcome> {
    const current = await tx.rounds.findCurrent();
    if (!current) {
      return this.open(tx, now);
    }
    if (current.status === 'BETTING') {
      return now < current.bettingEndsAt
        ? { waitMs: current.bettingEndsAt - now, events: [] }
        : this.start(tx, current.id, now);
    }
    const untilCrash = current.msUntilCrash(now);
    return untilCrash > 0
      ? { waitMs: untilCrash, events: [] }
      : this.crash(tx, current.id, now);
  }

  private async open(tx: GameLoopStepTx, now: number): Promise<Outcome> {
    const round = Round.create({
      id: this.ids.newId(),
      serverSeed: this.seeds.newSeed(),
      bettingEndsAt: now + this.timings.bettingMs,
    });
    await tx.rounds.save(round);
    return { waitMs: this.timings.bettingMs, events: round.pullEvents() };
  }

  /** FOR UPDATE espera as apostas em andamento (D57). */
  private async start(
    tx: GameLoopStepTx,
    id: string,
    now: number,
  ): Promise<Outcome> {
    const round = await tx.rounds.getForUpdate(id);
    round.start(now);
    await tx.rounds.save(round);
    return { waitMs: round.msUntilCrash(now), events: round.pullEvents() };
  }

  /** FOR UPDATE espera os cash outs em andamento antes de liquidar (D57). */
  private async crash(
    tx: GameLoopStepTx,
    id: string,
    now: number,
  ): Promise<Outcome> {
    const round = await tx.rounds.getForUpdate(id);
    round.crash(now);
    await tx.rounds.save(round);
    const settled = await tx.settlement.settle(round);
    return {
      waitMs: this.timings.pauseMs,
      events: [...round.pullEvents(), settled],
    };
  }
}
