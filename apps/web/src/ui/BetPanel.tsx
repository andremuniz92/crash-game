import type { MyBetDto } from '@crash/shared';
import { type FormEvent, useId, useReducer, useRef, useState } from 'react';
import { useGame, useGameState } from '../app/game-context.js';
import { formatCredits } from '../format/credits.js';
import { formatMultiplier } from '../format/multiplier.js';
import { betLimitsHint, readBetInput } from './bet-input.js';
import { CashOutValue } from './CashOutValue.js';
import styles from './BetPanel.module.css';
import { useBettingOpen } from './use-betting-open.js';

/** Erro da última ação, preso à rodada em que aconteceu. */
interface PanelError {
  roundId: string | null;
  message: string;
}

/**
 * Aposta e cash out (seções 6.3 e 10). O servidor decide (D3): as regras
 * daqui só evitam idas inúteis e cliques em dobro.
 */
export function BetPanel() {
  const { actions, clock, store } = useGame();
  const roundId = useGameState((state) => state.round?.id ?? null);
  const roundStatus = useGameState((state) => state.round?.status ?? null);
  const myBet = useGameState((state) => state.myBet);
  const balance = useGameState((state) => state.balance);
  const pending = useGameState((state) => state.pending);
  const bettingOpen = useBettingOpen();
  const [text, setText] = useState('');
  const [error, setError] = useState<PanelError | null>(null);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  // O estado só muda no próximo render; a ref trava o clique duplo antes dele.
  const inFlight = useRef({ bet: false, cashOut: false });
  const id = useId();

  const input = readBetInput(text, balance);
  const canBet =
    bettingOpen && myBet === null && !pending.bet && input.cents !== null;
  const canCashOut =
    roundStatus === 'RUNNING' &&
    myBet?.status === 'PENDING' &&
    !pending.cashOut;
  // Um "tarde demais" da rodada anterior não aparece na seguinte.
  const visibleError = error && error.roundId === roundId ? error : null;

  async function placeBet(event?: FormEvent) {
    event?.preventDefault();
    const { round } = store.getState();
    // Reconfere no clique: o timer do fechamento pode ter atrasado (aba em segundo plano).
    const open =
      round?.status === 'BETTING' && clock.serverNow() < round.bettingEndsAt;
    if (!open) {
      rerender();
      return;
    }
    if (!canBet || input.cents === null || inFlight.current.bet) return;
    inFlight.current.bet = true;
    setError(null);
    const result = await actions.placeBet(input.cents);
    inFlight.current.bet = false;
    if (result.status === 'failed') {
      setError({ roundId: round.id, message: result.message });
    }
  }

  async function cashOut() {
    if (!canCashOut || inFlight.current.cashOut) return;
    inFlight.current.cashOut = true;
    setError(null);
    const result = await actions.cashOut();
    inFlight.current.cashOut = false;
    if (result.status === 'failed') {
      setError({ roundId, message: result.message });
    }
  }

  return (
    <section className={styles.panel} aria-label="Aposta">
      <form
        className={styles.form}
        onSubmit={(event) => void placeBet(event)}
        noValidate
      >
        <label className={styles.label} htmlFor={`${id}-amount`}>
          Valor da aposta
        </label>
        <input
          id={`${id}-amount`}
          className={styles.input}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={input.message ? 'true' : undefined}
          aria-describedby={`${id}-hint${input.message ? ` ${id}-message` : ''}`}
          onChange={(event) => setText(event.target.value)}
        />
        <p id={`${id}-hint`} className={styles.hint}>
          {betLimitsHint()}
        </p>
        {input.message && (
          <p id={`${id}-message`} className={styles.invalid}>
            {input.message}
          </p>
        )}
        <button type="submit" className={styles.bet} disabled={!canBet}>
          Apostar
        </button>
      </form>
      <button
        type="button"
        className={styles.cashOut}
        disabled={!canCashOut}
        onClick={() => void cashOut()}
      >
        Sacar
        <CashOutValue />
      </button>
      <p className={styles.myBet}>{describeMyBet(myBet)}</p>
      {visibleError && (
        <p role="alert" className={styles.error}>
          {visibleError.message}
        </p>
      )}
    </section>
  );
}

function describeMyBet(myBet: MyBetDto | null): string {
  if (!myBet) return '';
  switch (myBet.status) {
    case 'PENDING':
      return `Sua aposta: ${formatCredits(myBet.amount)}`;
    case 'CASHED_OUT':
      return `Você sacou em ${formatMultiplier(myBet.cashoutMultiplier ?? 0)}: ${formatCredits(myBet.payout ?? 0)}`;
    case 'LOST':
      return 'Não foi desta vez';
  }
}
