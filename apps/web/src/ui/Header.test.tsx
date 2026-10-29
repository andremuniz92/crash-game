import { act } from '@testing-library/react';
import { Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type ConnectionStatus,
  setBalance,
  setConnection,
  signIn,
} from '../store/game-state.js';
import { createGameStore } from '../store/game-store.js';
import { renderWithGame } from '../testing/render-game.js';
import { Header, HeaderAccount } from './Header.js';

const ana = {
  playerId: 'a0a0a0a0-0000-4000-8000-000000000001',
  nickname: 'ana',
};

describe('Header', () => {
  it('HD1: mostra o nickname e o saldo formatado', () => {
    const store = createGameStore();
    store.setState((state) => signIn(state, ana, 100_000), true);

    const { container } = renderWithGame(<Header />, { store });

    expect(container.textContent).toContain('ana');
    expect(container.textContent).toContain('1.000,00');
  });

  it('HD2: sem jogador, não mostra conta; com saldo null, mostra "—"', () => {
    const { container, store } = renderWithGame(<Header />);
    expect(container.textContent).not.toContain('ana');
    expect(container.textContent).not.toContain('—');

    act(() => store.setState((state) => ({ ...state, player: ana }), true));
    expect(container.textContent).toContain('ana');
    expect(container.textContent).toContain('—');
  });

  it.each([
    ['connecting', 'Conectando…'],
    ['syncing', 'Sincronizando…'],
    ['live', 'Ao vivo'],
    ['waiting', 'Reconectando…'],
  ] as [ConnectionStatus, string][])(
    'HD3: conexão %s aparece como "%s"',
    (status, label) => {
      const { container, store } = renderWithGame(<Header />);
      act(() => store.setState((state) => setConnection(state, status), true));
      expect(container.textContent).toContain(label);
    },
  );

  it('HD3: mudar a conexão não re-renderiza a conta; mudar o saldo, sim', () => {
    const store = createGameStore();
    store.setState((state) => signIn(state, ana, 100_000), true);
    const commits = vi.fn();
    renderWithGame(
      <Profiler id="conta" onRender={commits}>
        <HeaderAccount />
      </Profiler>,
      { store },
    );
    commits.mockClear();

    act(() => store.setState((state) => setConnection(state, 'live'), true));
    expect(commits).not.toHaveBeenCalled();

    act(() => store.setState((state) => setBalance(state, 99_000), true));
    expect(commits).toHaveBeenCalledTimes(1);
  });
});
