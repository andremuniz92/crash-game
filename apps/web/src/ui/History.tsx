import { useState } from 'react';
import { useGameState } from '../app/game-context.js';
import { formatMultiplier } from '../format/multiplier.js';
import styles from './History.module.css';
import { VerifyPanel } from './VerifyPanel.js';

/** Abaixo de 2,00x é a faixa "baixa"; a cor ajuda a ler a sequência. */
const HIGH_FROM = 200;

/** Últimos crashes (até 20); clicar num deles abre a verificação. */
export function History() {
  const history = useGameState((state) => state.history);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section className={styles.history} aria-labelledby="history-title">
      <h2 id="history-title" className={styles.title}>
        Últimos crashes
      </h2>
      {history.length === 0 ? (
        <p className={styles.empty}>Nenhum crash ainda.</p>
      ) : (
        <ul className={styles.list}>
          {history.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={styles.chip}
                data-tier={item.crashPoint >= HIGH_FROM ? 'high' : 'low'}
                aria-pressed={selected === item.id}
                onClick={() => setSelected(item.id)}
              >
                {formatMultiplier(item.crashPoint)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <VerifyPanel roundId={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
