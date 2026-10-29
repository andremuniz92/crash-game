import { useEffect, useReducer } from 'react';
import { useGame, useGameState } from '../app/game-context.js';
import { bettingOpenAt } from './betting-countdown.js';

/**
 * A janela de apostas está aberta pelo relógio do servidor (D74): BETTING e
 * serverNow() < bettingEndsAt. O fechamento não vem por mensagem, então um
 * timer força um re-render no prazo; no disparo, reconfere e reagenda se o
 * offset mudou e ainda falta tempo (timer atrasado nunca fecha antes da hora).
 */
export function useBettingOpen(): boolean {
  const { clock } = useGame();
  const round = useGameState((state) =>
    state.round?.status === 'BETTING' ? state.round : null,
  );
  const bettingEndsAt = round?.bettingEndsAt ?? null;
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (bettingEndsAt === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const remaining = bettingEndsAt - clock.serverNow();
      if (remaining <= 0) rerender();
      else timer = setTimeout(check, remaining);
    };
    check();
    return () => clearTimeout(timer);
  }, [bettingEndsAt, clock]);

  return bettingOpenAt(round, clock.serverNow());
}
