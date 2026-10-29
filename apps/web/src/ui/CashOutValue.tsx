import { ONE_X } from '@crash/shared';
import { useEffect, useRef } from 'react';
import { useGame } from '../app/game-context.js';
import { formatCredits } from '../format/credits.js';
import { displayMultiplier } from '../store/display-multiplier.js';

/**
 * Quanto o cash out pagaria agora: aposta × multiplicador, arredondado para
 * baixo como no servidor (seção 6.3). Mesma técnica do MultiplierText: assina
 * o loop único (D89) e escreve no textContent, sem re-render; os dois usam o
 * mesmo serverNow em cada frame. O valor é visual (aria-hidden): o nome
 * acessível do botão continua "Sacar".
 */
export function CashOutValue() {
  const { store, frames } = useGame();
  const element = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      frames.subscribe((serverNow) => {
        const node = element.current;
        if (!node) return;
        const { round, myBet } = store.getState();
        let text = '';
        if (round?.status === 'RUNNING' && myBet?.status === 'PENDING') {
          const multiplier = displayMultiplier(round, serverNow);
          if (multiplier !== null) {
            text = ` ${formatCredits(Math.floor((myBet.amount * multiplier) / ONE_X))}`;
          }
        }
        node.textContent = text;
      }),
    [store, frames],
  );

  return <span ref={element} aria-hidden="true" />;
}
