import type { MyBetDto, RoundDto } from '@crash/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../store/game-store.js';
import { BettingCountdown } from '../ui/BettingCountdown.js';
import { CashOutValue } from '../ui/CashOutValue.js';
import { fakeFrames } from '../testing/fake-browser.js';
import { renderWithGame } from '../testing/render-game.js';
import { MultiplierText } from './MultiplierText.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const running: RoundDto = {
  status: 'RUNNING',
  id: '00000000-0000-4000-8000-0000000000a1',
  seedHash: 'h'.repeat(64),
  bettingEndsAt: 0,
  startedAt: 0,
};
const pending: MyBetDto = {
  betId: 'b0b0b0b0-0000-4000-8000-000000000001',
  amount: 1_000,
  status: 'PENDING',
  cashoutMultiplier: null,
  payout: null,
};

describe('um relógio por frame (D89)', () => {
  it('SF1: multiplicador e valor do saque leem o relógio uma vez e concordam', () => {
    const frames = fakeFrames();
    const store = createGameStore();
    store.load({ round: running, bets: [], myBet: pending, serverTime: 0 });
    // Cada leitura avança 11.553 ms: duas leituras dariam valores diferentes.
    let now = 0;
    const clock = { serverNow: vi.fn(() => (now += 11_553)) };
    const { getByTestId } = renderWithGame(
      <>
        <span data-testid="multiplier">
          <MultiplierText />
        </span>
        <span data-testid="cashout">
          <CashOutValue />
        </span>
      </>,
      { store, clock },
    );
    clock.serverNow.mockClear();
    now = 0;

    frames.step();

    expect(clock.serverNow).toHaveBeenCalledTimes(1);
    // 11.553 ms → 2,00x; 1.000 centavos × 2,00x = 20,00.
    expect(getByTestId('multiplier').textContent).toBe('2,00x');
    expect(getByTestId('cashout').textContent).toBe(' 20,00');
  });

  it('SF2: multiplicador, valor do saque e contador leem o relógio uma vez por frame', () => {
    const frames = fakeFrames();
    const store = createGameStore();
    const betting: RoundDto = {
      status: 'BETTING',
      id: running.id,
      seedHash: running.seedHash,
      bettingEndsAt: 10_000,
    };
    store.load({ round: betting, bets: [], myBet: null, serverTime: 0 });
    let now = 0;
    const clock = { serverNow: vi.fn(() => now) };
    const { getByTestId } = renderWithGame(
      <>
        <span data-testid="multiplier">
          <MultiplierText />
        </span>
        <span data-testid="cashout">
          <CashOutValue />
        </span>
        <span data-testid="countdown">
          <BettingCountdown />
        </span>
      </>,
      { store, clock },
    );
    clock.serverNow.mockClear();
    now = 6_500;

    frames.step();

    expect(clock.serverNow).toHaveBeenCalledTimes(1);
    expect(getByTestId('multiplier').textContent).toBe('1,00x');
    expect(
      getByTestId('countdown').querySelector('[data-countdown-seconds]')
        ?.textContent,
    ).toBe('4');
  });
});
