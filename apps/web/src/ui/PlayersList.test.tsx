import type {
  CurrentRoundResponse,
  MyBetDto,
  RoundBetDto,
  WsMessage,
} from '@crash/shared';
import { act, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setBalance, setConnection } from '../store/game-state.js';
import { createGameStore } from '../store/game-store.js';
import { renderWithGame } from '../testing/render-game.js';
import { PlayersList } from './PlayersList.js';

const ROUND = '00000000-0000-4000-8000-0000000000a1';
const bet = (n: number) => `b0b0b0b0-0000-4000-8000-00000000000${n}`;
const row = (
  n: number,
  nickname: string,
  overrides: Partial<RoundBetDto> = {},
): RoundBetDto => ({
  betId: bet(n),
  nickname,
  amount: 1_000 * n,
  status: 'PENDING',
  cashoutMultiplier: null,
  payout: null,
  ...overrides,
});

function setup(
  bets: RoundBetDto[],
  myBet: MyBetDto | null = null,
  status: 'RUNNING' | 'CRASHED' = 'RUNNING',
) {
  const store = createGameStore();
  const round =
    status === 'RUNNING'
      ? {
          status,
          id: ROUND,
          seedHash: 'h'.repeat(64),
          bettingEndsAt: 0,
          startedAt: 0,
        }
      : {
          status,
          id: ROUND,
          seedHash: 'h'.repeat(64),
          bettingEndsAt: 0,
          startedAt: 0,
          crashedAt: 1,
          crashPoint: 150,
          serverSeed: 's'.repeat(64),
        };
  const snapshot: CurrentRoundResponse = { round, bets, myBet, serverTime: 0 };
  store.load(snapshot);
  return renderWithGame(<PlayersList />, { store });
}

const items = () => within(screen.getByRole('list')).getAllByRole('listitem');

describe('PlayersList', () => {
  it('PL1: lista as apostas na ordem de chegada, com nickname, valor e o total', () => {
    setup([row(1, 'ana'), row(2, 'bia'), row(3, 'caio')]);

    expect(items().map((item) => item.textContent)).toEqual([
      expect.stringContaining('ana'),
      expect.stringContaining('bia'),
      expect.stringContaining('caio'),
    ]);
    expect(items()[1]?.textContent).toContain('20,00');
    expect(screen.getByText('3 jogadores')).toBeTruthy();
  });

  it('PL2: destaca a minha aposta pelo betId, mesmo com nickname repetido', () => {
    const mine: MyBetDto = {
      betId: bet(2),
      amount: 2_000,
      status: 'PENDING',
      cashoutMultiplier: null,
      payout: null,
    };
    setup([row(1, 'ana'), row(2, 'ana')], mine);

    const [first, second] = items();
    expect(first?.getAttribute('aria-current')).toBeNull();
    expect(first?.textContent).not.toContain('(você)');
    expect(second?.getAttribute('aria-current')).toBe('true');
    expect(second?.textContent).toContain('(você)');
  });

  it('PL3: quem sacou mostra multiplicador e payout; quem perdeu, "perdeu"; na rodada, nenhum', () => {
    setup(
      [
        row(1, 'ana', {
          status: 'CASHED_OUT',
          cashoutMultiplier: 182,
          payout: 1_820,
        }),
        row(2, 'bia', { status: 'LOST' }),
        row(3, 'caio'),
      ],
      null,
      'CRASHED',
    );

    const [cashed, lost, playing] = items();
    expect(cashed?.textContent).toContain('1,82x · 18,20');
    expect(lost?.textContent).toContain('perdeu');
    expect(playing?.textContent).not.toMatch(/perdeu|x ·/);
  });

  it('PL4: um bet:cashed_out atualiza só a linha daquele betId', () => {
    const { store } = setup([row(1, 'ana'), row(2, 'ana')]);
    const cashed: WsMessage = {
      type: 'bet:cashed_out',
      payload: {
        roundId: ROUND,
        betId: bet(2),
        nickname: 'ana',
        multiplier: 150,
        payout: 3_000,
      },
      serverTime: 1,
    };

    act(() => store.receive(cashed));

    expect(items()[0]?.textContent).not.toContain('1,50x');
    expect(items()[1]?.textContent).toContain('1,50x · 30,00');
  });

  it('PL5: ticks e mudanças que a lista não usa (conexão, saldo) não a re-renderizam', () => {
    const store = createGameStore();
    store.load({
      round: {
        status: 'RUNNING',
        id: ROUND,
        seedHash: 'h'.repeat(64),
        bettingEndsAt: 0,
        startedAt: 0,
      },
      bets: [row(1, 'ana')],
      myBet: null,
      serverTime: 0,
    });
    const commits = vi.fn();
    renderWithGame(
      <Profiler id="jogadores" onRender={commits}>
        <PlayersList />
      </Profiler>,
      { store },
    );
    commits.mockClear();

    act(() => {
      for (let i = 1; i <= 5; i++) {
        store.receive({
          type: 'round:tick',
          payload: { roundId: ROUND, multiplier: 100 + i },
          serverTime: i,
        });
      }
      store.setState((state) => setConnection(state, 'live'), true);
      store.setState((state) => setBalance(state, 42), true);
    });

    expect(commits).not.toHaveBeenCalled();
  });

  it('PL6: sem apostas, avisa que ninguém apostou', () => {
    setup([]);
    expect(
      screen.getByText('Ninguém apostou ainda nesta rodada.'),
    ).toBeTruthy();
  });
});
