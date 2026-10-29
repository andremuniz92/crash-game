import type { RoundBetDto } from '@crash/shared';
import { useGameState } from '../app/game-context.js';
import { formatCredits } from '../format/credits.js';
import { formatMultiplier } from '../format/multiplier.js';
import styles from './PlayersList.module.css';

/**
 * Apostas da rodada, da store (D75), na ordem de chegada. A minha é a do
 * mesmo betId do myBet (D71), nunca a do mesmo nickname. Assina só as
 * apostas e o myBet: ticks não a re-renderizam.
 */
export function PlayersList() {
  const bets = useGameState((state) => state.bets);
  const myBetId = useGameState((state) => state.myBet?.betId ?? null);

  return (
    <section className={styles.players} aria-labelledby="players-title">
      <h2 id="players-title" className={styles.title}>
        {bets.length === 1 ? '1 jogador' : `${bets.length} jogadores`}
      </h2>
      {bets.length === 0 ? (
        <p className={styles.empty}>Ninguém apostou ainda nesta rodada.</p>
      ) : (
        <ul className={styles.list}>
          {bets.map((bet) => {
            const mine = bet.betId === myBetId;
            return (
              <li
                key={bet.betId}
                className={styles.row}
                data-status={bet.status}
                aria-current={mine ? 'true' : undefined}
              >
                <span className={styles.nickname}>
                  {bet.nickname}
                  {mine && <span className={styles.mine}> (você)</span>}
                </span>
                <span className={styles.amount}>
                  {formatCredits(bet.amount)}
                </span>
                <span className={styles.result}>{describe(bet)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function describe(bet: RoundBetDto): string {
  if (bet.status === 'LOST') return 'perdeu';
  if (
    bet.status === 'CASHED_OUT' &&
    bet.cashoutMultiplier !== null &&
    bet.payout !== null
  ) {
    return `${formatMultiplier(bet.cashoutMultiplier)} · ${formatCredits(bet.payout)}`;
  }
  return '';
}
