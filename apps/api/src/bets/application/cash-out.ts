import type { CashOutResponse } from '@crash/shared';
import type {
  EventPublisher,
  PublishedEvent,
} from '../../shared/application/event-publisher.js';
import {
  idempotent,
  type IdempotencyStore,
  type IdempotentResult,
} from '../../shared/application/idempotency.js';
import { requestHash } from '../../shared/application/request-hash.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { Clock } from '../../shared/domain/clock.js';
import type { Bet } from '../domain/bet.js';
import {
  BetNotFoundError,
  type BetRepository,
} from '../domain/bet-repository.js';
import type { RoundReader } from './round-reader.js';
import type { WalletPort } from './wallet-port.js';

export interface CashOutTx {
  rounds: RoundReader;
  bets: BetRepository;
  wallet: WalletPort;
  idempotency: IdempotencyStore;
}

export interface CashOutCommand {
  playerId: string;
  betId: string;
  idempotencyKey: string;
}

/**
 * Cash out (seção 10.2). Locks na ordem rodada → aposta → carteira (D57):
 * a rodada em FOR SHARE segura o crash até o commit, então a liquidação
 * nunca grava LOST por cima de um cash out aceito.
 */
export class CashOut {
  constructor(
    private readonly uow: UnitOfWork<CashOutTx>,
    private readonly clock: Clock,
    private readonly events: EventPublisher,
  ) {}

  async execute({
    playerId,
    betId,
    idempotencyKey,
  }: CashOutCommand): Promise<IdempotentResult<CashOutResponse>> {
    const now = this.clock.now();
    let events: PublishedEvent[] = [];

    const result = await this.uow.run((tx) =>
      idempotent(
        tx.idempotency,
        {
          playerId,
          key: idempotencyKey,
          // O betId já está no endpoint; o corpo é vazio.
          endpoint: `POST /bets/${betId}/cashout`,
          requestHash: requestHash({}),
        },
        { now, status: 200 },
        async () => {
          // Sem lock, só para saber qual rodada travar primeiro.
          const found = await tx.bets.findByIdAndPlayer(betId, playerId);
          if (!found) throw notFound(betId);
          const round = await tx.rounds.findByIdForShare(found.roundId);
          const bet = await tx.bets.getByIdAndPlayerForUpdate(betId, playerId);
          // A FK garante a rodada, e apostas não são apagadas.
          if (!round || !bet) throw notFound(betId);

          bet.cashOut({ round, now });
          await tx.bets.save(bet);
          const { multiplier, payout } = cashedOut(bet);
          const balance = await tx.wallet.creditForCashout(
            playerId,
            payout,
            bet.id,
            now,
          );
          events = bet.pullEvents();
          return {
            betId: bet.id,
            multiplier: multiplier.x100,
            payout: payout.cents,
            balance: balance.cents,
          };
        },
      ),
    );

    // Só depois do commit, e nunca num replay (D60, D62).
    if (!result.replayed) this.events.publish(events);
    return result;
  }
}

function notFound(betId: string): BetNotFoundError {
  return new BetNotFoundError(`a aposta ${betId} não existe`);
}

/** Depois de um cashOut bem-sucedido, multiplicador e payout existem. */
function cashedOut(bet: Bet) {
  const { cashoutMultiplier: multiplier, payout } = bet;
  if (multiplier === null || payout === null) {
    throw new Error(`a aposta ${bet.id} não registrou o cash out`);
  }
  return { multiplier, payout };
}
