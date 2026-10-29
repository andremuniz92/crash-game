import { useGameState } from '../app/game-context.js';
import { formatCredits } from '../format/credits.js';
import type { ConnectionStatus } from '../store/game-state.js';
import styles from './Header.module.css';

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Conectando…',
  syncing: 'Sincronizando…',
  live: 'Ao vivo',
  waiting: 'Reconectando…',
};

/** Nickname e saldo; não re-renderiza quando só a conexão muda. */
export function HeaderAccount() {
  const player = useGameState((state) => state.player);
  const balance = useGameState((state) => state.balance);
  if (!player) return null;
  return (
    <p className={styles.account}>
      <span className={styles.nickname}>{player.nickname}</span>
      <span className={styles.balance}>
        <span className={styles.label}>Saldo</span>{' '}
        {balance === null ? '—' : formatCredits(balance)}
      </span>
    </p>
  );
}

/** Texto simples, sem role="status": o anúncio das mudanças é do RoundAnnouncer. */
export function HeaderConnection() {
  const connection = useGameState((state) => state.connection);
  return (
    <span className={styles.connection} data-connection={connection}>
      {CONNECTION_LABELS[connection]}
    </span>
  );
}

export function Header() {
  return (
    <header className={styles.header}>
      <strong className={styles.brand}>Crash Game</strong>
      <HeaderAccount />
      <HeaderConnection />
    </header>
  );
}
