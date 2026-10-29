import type { LedgerEntryDto, RoundDto, WalletResponse } from '@crash/shared';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createActions } from '../app/actions.js';
import { createSessionStorage, SESSION_KEY } from '../app/session.js';
import { createApiClient } from '../net/api-client.js';
import { applyBetPlaced, signIn } from '../store/game-state.js';
import { createGameStore } from '../store/game-store.js';
import { fakeFetch, json } from '../testing/fake-fetch.js';
import { memoryStorage } from '../testing/fake-storage.js';
import { renderWithGame } from '../testing/render-game.js';
import { HeaderAccount } from './Header.js';
import { WalletPanel } from './WalletPanel.js';

const ROUND = '00000000-0000-4000-8000-0000000000a1';
const BET = 'b0b0b0b0-0000-4000-8000-000000000001';
const ana = {
  playerId: 'a0a0a0a0-0000-4000-8000-000000000001',
  nickname: 'ana',
};
const T = Date.parse('2026-10-29T15:04:05.000Z');
const entry = (
  type: LedgerEntryDto['type'],
  amount: number,
  at = T,
): LedgerEntryDto => ({
  type,
  amount,
  betId: type === 'INITIAL_GRANT' ? null : BET,
  createdAt: at,
});
const wallet = (
  balance: number,
  entries: LedgerEntryDto[],
): WalletResponse => ({ balance, entries });

function held() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return {
    responder: () => promise,
    release: (status: number, body: unknown) =>
      resolve(new Response(JSON.stringify(body), { status })),
  };
}

function setup(responders: Parameters<typeof fakeFetch>) {
  const fake = fakeFetch(...responders);
  const store = createGameStore();
  const round: RoundDto = {
    status: 'BETTING',
    id: ROUND,
    seedHash: 'h'.repeat(64),
    bettingEndsAt: 1,
  };
  store.load({ round, bets: [], myBet: null, serverTime: 0 });
  store.setState((state) => signIn(state, ana, 100_000), true);
  const { storage } = memoryStorage({
    [SESSION_KEY]: JSON.stringify({ ...ana, token: 'tok' }),
  });
  const actions = createActions({
    api: createApiClient({ baseUrl: 'http://api', fetch: fake.fetch }),
    store,
    session: createSessionStorage(storage),
    newKey: () => 'k',
    resync: vi.fn(),
  });
  const result = renderWithGame(
    <>
      <HeaderAccount />
      <WalletPanel />
    </>,
    { store, actions },
  );
  return { ...result, calls: fake.calls };
}

const toggle = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Carteira' }));
const ownBet = (store: ReturnType<typeof createGameStore>) =>
  act(() =>
    store.setState(
      (state) =>
        applyBetPlaced(state, {
          betId: BET,
          roundId: ROUND,
          amount: 1_000,
          balance: 99_000,
        }),
      true,
    ),
  );

describe('WalletPanel', () => {
  it('WL1: fechada não busca nada; ao abrir, busca e mostra saldo e extrato', async () => {
    const { calls } = setup([
      json(200, wallet(99_000, [entry('BET_PLACED', -1_000)])),
    ]);
    expect(calls).toHaveLength(0);
    expect(
      screen
        .getByRole('button', { name: 'Carteira' })
        .getAttribute('aria-expanded'),
    ).toBe('false');

    toggle();

    const region = await screen.findByRole('region', { name: 'Extrato' });
    expect(calls[0]?.url).toBe('http://api/wallet');
    expect(region.textContent).toContain('990,00');
    expect(within(region).getAllByRole('listitem')).toHaveLength(1);
  });

  it('WL2: com a carteira aberta, cada operação própria recarrega; fechada, não', async () => {
    const { calls, store } = setup([
      json(200, wallet(100_000, [entry('INITIAL_GRANT', 100_000)])),
      json(
        200,
        wallet(99_000, [
          entry('BET_PLACED', -1_000),
          entry('INITIAL_GRANT', 100_000),
        ]),
      ),
    ]);
    toggle();
    await screen.findByRole('region', { name: 'Extrato' });

    ownBet(store);
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Extrato' })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(2),
    );
    expect(calls).toHaveLength(2);

    toggle(); // fecha
    ownBet(store);
    expect(calls).toHaveLength(2);
  });

  it('WL3: cada lançamento tem tipo legível, sinal e hora', async () => {
    setup([
      json(
        200,
        wallet(100_820, [
          entry('CASHOUT', 1_820),
          entry('BET_PLACED', -1_000),
          entry('INITIAL_GRANT', 100_000),
        ]),
      ),
    ]);
    toggle();
    const items = within(
      await screen.findByRole('region', { name: 'Extrato' }),
    ).getAllByRole('listitem');

    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Cash out'),
      expect.stringContaining('Aposta'),
      expect.stringContaining('Crédito inicial'),
    ]);
    expect(items[0]?.textContent).toContain('+18,20');
    expect(items[1]?.textContent).toContain('-10,00');
    expect(items[0]?.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('WL4: extrato longo mostra os 20 que a API devolve, com a legenda', async () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      entry('BET_PLACED', -100, T - i * 1_000),
    );
    setup([json(200, wallet(98_000, entries))]);
    toggle();
    const region = await screen.findByRole('region', { name: 'Extrato' });

    expect(within(region).getAllByRole('listitem')).toHaveLength(20);
    expect(region.textContent).toContain('Últimos 20 lançamentos');
  });

  it('WL5: a resposta de uma carga antiga que chega depois da nova é descartada', async () => {
    const first = held();
    const { store } = setup([
      first.responder,
      json(
        200,
        wallet(99_000, [
          entry('BET_PLACED', -1_000),
          entry('INITIAL_GRANT', 100_000),
        ]),
      ),
    ]);
    toggle(); // carga 1, segurada
    ownBet(store); // carga 2, responde já
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Extrato' })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(2),
    );

    first.release(200, wallet(100_000, [entry('INITIAL_GRANT', 100_000)]));
    await act(() => Promise.resolve());

    expect(
      within(screen.getByRole('region', { name: 'Extrato' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(2);
  });

  it('WL6: o GET /wallet atualiza o saldo do cabeçalho; um 401 sai da sessão', async () => {
    const { container, store } = setup([
      json(200, wallet(98_500, [])),
      json(401, { code: 'UNAUTHORIZED', message: 'x' }),
    ]);
    toggle();
    await waitFor(() => expect(container.textContent).toContain('985,00'));

    ownBet(store);
    await waitFor(() => expect(store.getState().player).toBeNull());
  });
});
