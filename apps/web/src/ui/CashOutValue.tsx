import { ONE_X } from '@crash/shared';
import { useEffect, useRef } from 'react';
import { useGame } from '../app/game-context.js';
import { formatCredits } from '../format/credits.js';
import { displayMultiplier } from '../store/display-multiplier.js';

/**
 * Quanto o cash out pagaria agora: aposta × multiplicador, arredondado para
 * baixo como no servidor (seção 6.3). Mesma técnica do MultiplierText: rAF
 * escrevendo no textContent, sem re-render. O valor é visual (aria-hidden):
 * o nome acessível do botão continua "Sacar".
 */
export function CashOutValue() {
  const { store, clock } = useGame();
  const element = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const node = element.current;
      if (node) {
        const { round, myBet } = store.getState();
        let text = '';
        if (round?.status === 'RUNNING' && myBet?.status === 'PENDING') {
          const multiplier = displayMultiplier(round, clock.serverNow());
          if (multiplier !== null) {
            text = ` ${formatCredits(Math.floor((myBet.amount * multiplier) / ONE_X))}`;
          }
        }
        node.textContent = text;
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [store, clock]);

  return <span ref={element} aria-hidden="true" />;
}
