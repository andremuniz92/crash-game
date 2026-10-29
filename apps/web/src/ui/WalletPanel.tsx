import type { LedgerEntryDto, WalletResponse } from '@crash/shared';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useGame, useGameState } from '../app/game-context.js';
import { formatCredits } from '../format/credits.js';
import styles from './WalletPanel.module.css';

const TYPE_LABELS: Record<LedgerEntryDto['type'], string> = {
  INITIAL_GRANT: 'Crédito inicial',
  BET_PLACED: 'Aposta',
  CASHOUT: 'Cash out',
};

/** A API devolve no máximo os 20 lançamentos mais recentes (seção 8.1). */
const API_LIMIT = 20;

const time = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Saldo e extrato sob demanda: busca ao abrir e, aberta, depois de cada
 * operação própria (aposta ou cash out com sucesso).
 */
export function WalletPanel() {
  const { actions } = useGame();
  const ownOperations = useGameState((state) => state.ownOperations);
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cada carga ganha um número; resposta de carga antiga é descartada.
  const latest = useRef(0);
  const id = useId();

  const load = useCallback(async () => {
    const mine = ++latest.current;
    const result = await actions.loadWallet();
    if (mine !== latest.current) return;
    if (result.status === 'done') {
      setWallet(result.wallet);
      setError(null);
    } else {
      setError(result.message);
    }
  }, [actions]);

  useEffect(() => {
    if (open) void load();
  }, [open, ownOperations, load]);

  return (
    <section className={styles.wallet}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={`${id}-ledger`}
        onClick={() => setOpen((value) => !value)}
      >
        Carteira
      </button>
      {open && (
        <div
          id={`${id}-ledger`}
          className={styles.body}
          role="region"
          aria-label="Extrato"
        >
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {wallet === null && !error && (
            <p className={styles.muted}>Carregando…</p>
          )}
          {wallet && <Ledger wallet={wallet} />}
        </div>
      )}
    </section>
  );
}

function Ledger({ wallet }: { wallet: WalletResponse }) {
  return (
    <>
      <p className={styles.balance}>
        <span className={styles.muted}>Saldo</span>{' '}
        {formatCredits(wallet.balance)}
      </p>
      <p className={styles.muted}>
        {wallet.entries.length >= API_LIMIT
          ? `Últimos ${API_LIMIT} lançamentos`
          : 'Lançamentos'}
      </p>
      <ul className={styles.list}>
        {wallet.entries.map((entry, index) => (
          <li key={`${entry.createdAt}-${index}`} className={styles.entry}>
            <span>{TYPE_LABELS[entry.type]}</span>
            <span className={entry.amount < 0 ? styles.debit : styles.credit}>
              {entry.amount > 0 ? '+' : ''}
              {formatCredits(entry.amount)}
            </span>
            <time
              className={styles.muted}
              dateTime={new Date(entry.createdAt).toISOString()}
            >
              {time.format(entry.createdAt)}
            </time>
          </li>
        ))}
      </ul>
    </>
  );
}
