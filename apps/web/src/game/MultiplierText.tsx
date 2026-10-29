import { useEffect, useRef } from 'react';
import { useGame } from '../app/game-context.js';
import { formatMultiplier } from '../format/multiplier.js';
import { displayMultiplier } from '../store/display-multiplier.js';
import styles from './MultiplierText.module.css';

/**
 * Multiplicador em texto sobre o palco (D90). Cada frame do loop único (D89)
 * calcula o valor pelo serverNow do frame (D11) e escreve no textContent, sem
 * re-render do React (D75). Muda a cada frame, então fica fora da leitura de
 * tela: quem anuncia as mudanças de estado é o RoundAnnouncer.
 */
export function MultiplierText() {
  const { store, frames } = useGame();
  const element = useRef<HTMLParagraphElement>(null);

  useEffect(
    () =>
      frames.subscribe((serverNow) => {
        const node = element.current;
        if (!node) return;
        const { round } = store.getState();
        const value = displayMultiplier(round, serverNow);
        node.textContent = value === null ? '—' : formatMultiplier(value);
        node.dataset.status = round?.status ?? 'NONE';
      }),
    [store, frames],
  );

  return (
    <p ref={element} className={styles.multiplier} aria-hidden="true">
      —
    </p>
  );
}
