import type { PlaceBetResponse } from '@crash/shared';
import type {
  EventPublisher,
  PublishedEvent,
} from '../../shared/application/event-publisher.js';
import {
  idempotent,
  type IdempotencyStore,
  type IdempotentResult,
} from '../../shared/application/idempotency.js';
import type { IdGenerator } from '../../shared/application/id-generator.js';
import { requestHash } from '../../shared/application/request-hash.js';
import type { UnitOfWork } from '../../shared/application/unit-of-work.js';
import type { Clock } from '../../shared/domain/clock.js';
import { Money } from '../../shared/domain/money.js';
import {
  Bet,
  InvalidBetAmountError,
  RoundNotAcceptingBetsError,
} from '../domain/bet.js';
import {
  BetAlreadyPlacedError,
  type BetRepository,
} from '../domain/bet-repository.js';
import type { RoundReader } from './round-reader.js';
import type { WalletPort } from './wallet-port.js';

export interface PlaceBetTx {
  rounds: RoundReader;
  bets: BetRepository;
  wallet: WalletPort;
  idempotency: IdempotencyStore;
}

export interface PlaceBetCommand {
  playerId: string;
  amount: number;
  idempotencyKey: string;
}

/**
 * Aposta na rodada atual (seção 10.1). Locks na ordem rodada → aposta →
 * carteira (D57): a rodada em FOR SHARE segura o start até o commit, e a
 * aposta é gravada antes do débito porque o lançamento aponta para ela.
 */
export class PlaceBet {
  constructor(
    private readonly uow: UnitOfWork<PlaceBetTx>,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly events: EventPublisher,
  ) {}

  async execute({
    playerId,
    amount,
    idempotencyKey,
  }: PlaceBetCommand): Promise<IdempotentResult<PlaceBetResponse>> {
    const now = this.clock.now();
    const betId = this.ids.newId();
    let events: PublishedEvent[] = [];

    const result = await this.uow.run((tx) =>
      idempotent(
        tx.idempotency,
        {
          playerId,
          key: idempotencyKey,
          endpoint: 'POST /bets',
          requestHash: requestHash({ amount }),
        },
        { now, status: 201 },
        async () => {
          const round = await tx.rounds.findCurrentForShare();
          if (!round) {
            throw new RoundNotAcceptingBetsError('não há rodada aberta');
          }
          // Pré-checagem; o UNIQUE (round_id, player_id) é a última barreira (D33).
          if (await tx.bets.findByRoundAndPlayer(round.id, playerId)) {
            throw new BetAlreadyPlacedError(
              `o jogador ${playerId} já apostou na rodada ${round.id}`,
            );
          }
          const bet = Bet.place({
            id: betId,
            round,
            playerId,
            amount: betAmount(amount),
            now,
          });
          await tx.bets.save(bet);
          const balance = await tx.wallet.debitForBet(
            playerId,
            bet.amount,
            bet.id,
            now,
          );
          events = bet.pullEvents();
          return {
            betId: bet.id,
            roundId: round.id,
            amount: bet.amount.cents,
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

/**
 * Centavos → Money. Valor negativo ou fracionado vira INVALID_BET_AMOUNT,
 * como os de fora da faixa, e não o INVALID_MONEY (500) do VO (D58).
 */
function betAmount(cents: number): Money {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new InvalidBetAmountError(
      `a aposta deve ser um inteiro de centavos, recebido ${cents}`,
    );
  }
  return Money.fromCents(cents);
}
