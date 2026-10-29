import { useEffect, useRef } from 'react';
import { useGame } from '../app/game-context.js';
import styles from './BettingCountdown.module.css';
import { secondsLeft } from './betting-countdown.js';

/**
 * Segundos restantes da janela de apostas, no palco (D100). Assina o loop
 * único (D89) e só mexe no DOM quando o segundo muda, sem re-render. Fora da
 * leitura de tela (aria-hidden): quem anuncia é o RoundAnnouncer.
 */
export function BettingCountdown() {
  const { store, frames } = useGame();
  const element = useRef<HTMLParagraphElement>(null);
  const number = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // O que está na tela; o elemento nasce escondido.
    let shown: number | null = null;
    return frames.subscribe((serverNow) => {
      const node = element.current;
      const digits = number.current;
      if (!node || !digits) return;
      const value = secondsLeft(store.getState().round, serverNow);
      if (value === shown) return;
      if (value !== null) digits.textContent = String(value);
      if ((value === null) !== (shown === null)) node.hidden = value === null;
      shown = value;
    });
  }, [store, frames]);

  return (
    <p
      ref={element}
      data-countdown
      className={styles.countdown}
      aria-hidden="true"
      hidden
    >
      Apostas fecham em <span ref={number} data-countdown-seconds /> s
    </p>
  );
}
