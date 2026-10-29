import styles from './App.module.css';
import { useGameState } from './app/game-context.js';
import { GameStage } from './game/GameStage.js';
import { MultiplierText } from './game/MultiplierText.js';
import { GuestForm } from './ui/GuestForm.js';
import { Header } from './ui/Header.js';
import { RoundAnnouncer } from './ui/RoundAnnouncer.js';

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
        </section>
        <aside className={styles.panel}>
          {signedIn ? (
            <p className={styles.soon}>O painel de aposta chega em breve.</p>
          ) : (
            <GuestForm />
          )}
        </aside>
      </main>
      <RoundAnnouncer />
    </div>
  );
}
