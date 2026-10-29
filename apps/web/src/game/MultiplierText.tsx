import { useEffect, useRef } from 'react';
import { useGame } from '../app/game-context.js';
import { formatMultiplier } from '../format/multiplier.js';
import { displayMultiplier } from '../store/display-multiplier.js';
import styles from './MultiplierText.module.css';

/**
 * Multiplicador provisório até a cena do M5. Cada frame calcula o valor pelo
 * relógio do servidor (D11) e escreve no textContent, sem re-render do React
 * (D75). Muda a cada frame, então fica fora da leitura de tela: quem anuncia
 * as mudanças de estado é o RoundAnnouncer.
 */
export function MultiplierText() {
  const { store, clock } = useGame();
  const element = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const node = element.current;
      if (node) {
        const { round } = store.getState();
        const value = displayMultiplier(round, clock.serverNow());
        node.textContent = value === null ? '—' : formatMultiplier(value);
        node.dataset.status = round?.status ?? 'NONE';
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [store, clock]);

  return (
    <p ref={element} className={styles.multiplier} aria-hidden="true">
      —
    </p>
  );
}
