import styles from './App.module.css';
import { useGameState } from './app/game-context.js';
import { GameStage } from './game/GameStage.js';
import { MultiplierText } from './game/MultiplierText.js';
import { BetPanel } from './ui/BetPanel.js';
import { GuestForm } from './ui/GuestForm.js';
import { History } from './ui/History.js';
import { PlayersList } from './ui/PlayersList.js';
import { Header } from './ui/Header.js';
import { RoundAnnouncer } from './ui/RoundAnnouncer.js';
import { WalletPanel } from './ui/WalletPanel.js';

/** Palco à esquerda e painel à direita; em coluna abaixo de 768 px (D81). */
export function App() {
  const signedIn = useGameState((state) => state.player !== null);

  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.main}>
        <section className={styles.stage} aria-label="Rodada">
          <GameStage>
            <MultiplierText />
          </GameStage>
          <History />
        </section>
        <aside className={styles.panel}>
          {signedIn ? (
            <>
              <BetPanel />
              <WalletPanel />
            </>
          ) : (
            <GuestForm />
          )}
          <PlayersList />
        </aside>
      </main>
      <RoundAnnouncer />
    </div>
  );
}
