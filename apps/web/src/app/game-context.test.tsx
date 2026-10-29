import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setBalance } from '../store/game-state.js';
import { renderWithGame } from '../testing/render-game.js';
import { useGame, useGameState } from './game-context.js';

describe('GameProvider (D75, D83)', () => {
  it('GC1: os componentes leem store, ações e relógio do provider, e re-renderizam com o seletor', () => {
    function Balance() {
      const balance = useGameState((state) => state.balance);
      const { clock } = useGame();
      return (
        <p>
          {balance ?? '—'} @ {clock.serverNow()}
        </p>
      );
    }
    const { container, store } = renderWithGame(<Balance />, { serverNow: 42 });
    expect(container.textContent).toBe('— @ 42');

    act(() => store.setState((state) => setBalance(state, 500), true));
    expect(container.textContent).toBe('500 @ 42');
  });

  it('GC2: fora do provider, useGame lança com mensagem clara', () => {
    expect(() => renderHook(() => useGame())).toThrow(/GameProvider/);
    expect(() => render(<p />)).not.toThrow();
  });
});
