import type { VerifyResult } from '../app/actions.js';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setHistory } from '../store/game-state.js';
import { createGameStore } from '../store/game-store.js';
import { fakeActions, renderWithGame } from '../testing/render-game.js';
import { History } from './History.js';

const SEED = '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad';
const HASH = 'a'.repeat(64);
const id = (n: number) =>
  `00000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`;
const README =
  'https://github.com/andremuniz92/crash-game#verificando-uma-rodada';

function setup(result: VerifyResult) {
  const store = createGameStore();
  store.setState(
    (state) =>
      setHistory(state, [
        { id: id(1), crashPoint: 235, crashedAt: 2 },
        { id: id(2), crashPoint: 150, crashedAt: 1 },
      ]),
    true,
  );
  const verifyRound = vi.fn(() => Promise.resolve(result));
  renderWithGame(<History />, { store, actions: fakeActions({ verifyRound }) });
  return { verifyRound, store };
}

const done = (
  overrides: Partial<Extract<VerifyResult, { status: 'done' }>> = {},
): VerifyResult => ({
  status: 'done',
  serverSeed: SEED,
  seedHash: HASH,
  crashPoint: 235,
  seenLive: true,
  hashMatches: true,
  ...overrides,
});

const open = async (label = '2,35x') => {
  fireEvent.click(screen.getByRole('button', { name: label }));
  return screen.findByRole('region', { name: 'Verificação' });
};

describe('History e VerifyPanel', () => {
  it('HI7: mostra os crashes como botões, com faixa de cor, e clicar verifica aquela rodada', async () => {
    const { verifyRound } = setup(done());

    const buttons = within(screen.getByRole('list')).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['2,35x', '1,50x']);
    expect(buttons.map((b) => b.dataset.tier)).toEqual(['high', 'low']);

    await open();
    expect(verifyRound).toHaveBeenCalledWith(id(1));
  });

  it('HI7: um crash novo pelo store aparece no topo', () => {
    const { store } = setup(done());
    act(() =>
      store.setState(
        (state) =>
          setHistory(state, [{ id: id(3), crashPoint: 1_000, crashedAt: 3 }]),
        true,
      ),
    );
    expect(
      within(screen.getByRole('list')).getAllByRole('button')[0]?.textContent,
    ).toBe('10,00x');
  });

  it('VF6: mostra seed, hash, crash point, o que a conferência prova e o comando para conferir por fora', async () => {
    setup(done());
    const panel = await open();

    expect(panel.textContent).toContain(SEED);
    expect(panel.textContent).toContain(HASH);
    expect(panel.textContent).toContain('2,35x');
    expect(panel.textContent).toContain('Confere');
    expect(panel.textContent).toMatch(/a seed estava fixada antes da rodada/);
    expect(panel.textContent).toMatch(/HMAC/);
    expect(panel.textContent).toContain(`printf '%s' '${SEED}' | sha256sum`);
    expect(within(panel).getByRole('link').getAttribute('href')).toBe(README);
  });

  it('VF2: seed que não bate mostra "Não confere"', async () => {
    setup(done({ hashMatches: false }));
    expect((await open()).textContent).toContain('Não confere');
  });

  it('VF4: rodada não vista ao vivo avisa que a página não viu o hash publicado antes', async () => {
    setup(done({ seenLive: false }));
    expect((await open()).textContent).toContain(
      'Esta página não viu o hash publicado antes desta rodada',
    );
  });

  it('VF5: sem crypto.subtle, a conferência fica indisponível e os dados continuam visíveis', async () => {
    setup(done({ hashMatches: null }));
    const panel = await open();
    expect(panel.textContent).toContain(
      'O navegador só libera o SHA-256 em HTTPS ou localhost',
    );
    expect(panel.textContent).not.toMatch(/Não confere|Confere:/);
    expect(panel.textContent).toContain(SEED);
  });

  it('VF7: erro do verify aparece em role="alert" com a mensagem da tabela', async () => {
    setup({
      status: 'failed',
      message: 'A seed só é revelada depois do crash.',
    });
    await open();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'A seed só é revelada depois do crash.',
    );
  });
});
