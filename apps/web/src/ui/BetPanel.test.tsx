import type {
  CurrentRoundResponse,
  MyBetDto,
  RoundDto,
  WsMessage,
} from '@crash/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '../app/actions.js';
import { createActions } from '../app/actions.js';
import { createSessionStorage, SESSION_KEY } from '../app/session.js';
import { createApiClient } from '../net/api-client.js';
import { signIn } from '../store/game-state.js';
import { createGameStore } from '../store/game-store.js';
import { fakeFetch, json } from '../testing/fake-fetch.js';
import { memoryStorage } from '../testing/fake-storage.js';
import { fakeActions, renderWithGame } from '../testing/render-game.js';
import { BetPanel } from './BetPanel.js';
import { HeaderAccount } from './Header.js';

const ROUND = '00000000-0000-4000-8000-0000000000a1';
const NEXT = '00000000-0000-4000-8000-0000000000a2';
const BET = 'b0b0b0b0-0000-4000-8000-000000000001';
const OFFSET = 50_000;
const ana = {
  playerId: 'a0a0a0a0-0000-4000-8000-000000000001',
  nickname: 'ana',
};
const clock = { serverNow: () => Date.now() + OFFSET };

const betting = (endsIn = 60_000): RoundDto => ({
  status: 'BETTING',
  id: ROUND,
  seedHash: 'h'.repeat(64),
  bettingEndsAt: clock.serverNow() + endsIn,
});
const running = (): RoundDto => ({
  status: 'RUNNING',
  id: ROUND,
  seedHash: 'h'.repeat(64),
  bettingEndsAt: clock.serverNow() - 1_000,
  startedAt: clock.serverNow() - 1_000,
});
const pendingBet: MyBetDto = {
  betId: BET,
  amount: 1_000,
  status: 'PENDING',
  cashoutMultiplier: null,
  payout: null,
};
const placed = { betId: BET, roundId: ROUND, amount: 1_000, balance: 99_000 };
const cashed = { betId: BET, multiplier: 182, payout: 1_820, balance: 100_820 };
const apiError = (status: number, code: string) =>
  json(status, { code, message: `texto do servidor: ${code}` });

/** Resposta segurada pelo teste. */
function held() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return {
    responder: () => promise,
    release: (status: number, body: unknown) =>
      resolve(new Response(JSON.stringify(body), { status })),
  };
}

function setup({
  round = betting(),
  myBet = null,
  balance = 100_000,
  responders = [],
  actions,
}: {
  round?: RoundDto;
  myBet?: MyBetDto | null;
  balance?: number | null;
  responders?: Parameters<typeof fakeFetch>;
  actions?: ReturnType<typeof fakeActions>;
} = {}) {
  const fake = fakeFetch(...responders);
  const store = createGameStore();
  const snapshot: CurrentRoundResponse = {
    round,
    bets: [],
    myBet,
    serverTime: clock.serverNow(),
  };
  store.load(snapshot);
  store.setState((state) => ({ ...signIn(state, ana, 0), balance }), true);
  const { storage } = memoryStorage({
    [SESSION_KEY]: JSON.stringify({ ...ana, token: 'tok' }),
  });
  let keys = 0;
  const realActions = createActions({
    api: createApiClient({ baseUrl: 'http://api', fetch: fake.fetch }),
    store,
    session: createSessionStorage(storage),
    newKey: () => `key-${++keys}`,
    resync: vi.fn(),
    sleep: () => Promise.resolve(),
  });
  const result = renderWithGame(
    <>
      <HeaderAccount />
      <BetPanel />
    </>,
    { store, clock, actions: actions ?? realActions },
  );
  return { ...result, calls: fake.calls };
}

const amount = () => screen.getByLabelText<HTMLInputElement>('Valor da aposta');
const betButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: /^Apostar/ });
const cashButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: /^Sacar/ });
const alert = () => screen.queryByRole('alert');
const type = (value: string) =>
  fireEvent.change(amount(), { target: { value } });
const submit = () => fireEvent.submit(amount().closest('form')!);

afterEach(() => {
  vi.useRealTimers();
});

describe('BetPanel: valor da aposta (D79)', () => {
  it('BI1/BI2: dica dos limites; valor inválido mostra a mensagem, marca aria-invalid e desabilita o Apostar', () => {
    setup();
    const described = () =>
      (amount().getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent)
        .join(' | ');

    expect(described()).toContain('Mínimo 1,00 · máximo 1.000,00');
    type('0,50');
    expect(described()).toContain('A aposta mínima é 1,00.');
    expect(amount().getAttribute('aria-invalid')).toBe('true');
    expect(betButton().disabled).toBe(true);

    type('10');
    expect(amount().getAttribute('aria-invalid')).toBeNull();
    expect(betButton().disabled).toBe(false);
  });

  it('BI3: campo vazio não tem mensagem e o Apostar fica desabilitado', () => {
    setup();
    expect(amount().getAttribute('aria-invalid')).toBeNull();
    expect(betButton().disabled).toBe(true);
  });

  it('BI4: "10.50" manda 1.050 centavos', async () => {
    const { calls } = setup({
      responders: [json(201, { ...placed, amount: 1_050 })],
    });
    type('10.50');
    fireEvent.click(betButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ amount: 1_050 });
  });
});

describe('BetPanel: prazo e trava (D74, D78)', () => {
  it('BO4: com o timer atrasado, o clique depois do prazo não manda nada e fecha o botão', () => {
    vi.useFakeTimers();
    const { calls } = setup({ round: betting(3_000) });
    type('10');
    expect(betButton().disabled).toBe(false);

    vi.setSystemTime(Date.now() + 5_000); // o relógio anda, o timer ainda não disparou
    fireEvent.click(betButton());

    expect(calls).toHaveLength(0);
    expect(betButton().disabled).toBe(true);
  });

  it('EN1: Enter envia; Enter repetido gera uma requisição só', async () => {
    const response = held();
    const { calls } = setup({ responders: [response.responder] });
    type('10');

    submit();
    submit();
    submit();

    expect(calls).toHaveLength(1);
    response.release(201, placed);
    await waitFor(() => expect(betButton().disabled).toBe(true));
  });

  it('EN1: Enter com valor inválido ou depois do prazo (timer atrasado) não envia', () => {
    vi.useFakeTimers();
    const { calls } = setup({ round: betting(3_000) });
    type('0,50');
    submit();
    type('10');
    vi.setSystemTime(Date.now() + 5_000);
    submit();
    expect(calls).toHaveLength(0);
  });

  it('BO5: com aposta já feita na rodada, o Apostar fica desabilitado', () => {
    setup({ myBet: pendingBet });
    type('10');
    expect(betButton().disabled).toBe(true);
  });

  it('RQ1: durante o POST /bets o Apostar fica desabilitado, e volta depois de um erro', async () => {
    const response = held();
    setup({ responders: [response.responder] });
    type('10');
    fireEvent.click(betButton());
    expect(betButton().disabled).toBe(true);

    response.release(422, { code: 'INSUFFICIENT_BALANCE', message: 'x' });
    await waitFor(() => expect(betButton().disabled).toBe(false));
  });

  it('RQ2: clique duplo no Apostar gera uma requisição só', () => {
    const response = held();
    const { calls } = setup({ responders: [response.responder] });
    type('10');
    fireEvent.click(betButton());
    fireEvent.click(betButton());
    expect(calls).toHaveLength(1);
  });

  it('RQ2b: a trava do próprio painel segura o segundo clique, mesmo sem a trava da ação', () => {
    let finish!: (result: ActionResult) => void;
    const placeBet = vi.fn(
      () => new Promise<ActionResult>((resolve) => (finish = resolve)),
    );
    setup({ actions: fakeActions({ placeBet }) });
    type('10');
    fireEvent.click(betButton());
    fireEvent.click(betButton());
    expect(placeBet).toHaveBeenCalledTimes(1);
    act(() => finish({ status: 'done' }));
  });
});

describe('BetPanel: Sacar', () => {
  it.each([
    ['BETTING com myBet', betting(), pendingBet, true],
    ['RUNNING sem myBet', running(), null, true],
    [
      'RUNNING com myBet CASHED_OUT',
      running(),
      {
        ...pendingBet,
        status: 'CASHED_OUT' as const,
        cashoutMultiplier: 150,
        payout: 1_500,
      },
      true,
    ],
    [
      'RUNNING com myBet LOST',
      running(),
      { ...pendingBet, status: 'LOST' as const },
      true,
    ],
    ['RUNNING com myBet PENDING', running(), pendingBet, false],
  ])('CO1: %s', (_case, round, myBet, disabled) => {
    setup({ round, myBet });
    expect(cashButton().disabled).toBe(disabled);
  });

  it('CO2: depois de recarregar, o snapshot com RUNNING e myBet PENDING habilita o Sacar', () => {
    const { store } = setup({ round: betting() });
    expect(cashButton().disabled).toBe(true);

    act(() =>
      store.load({
        round: running(),
        bets: [],
        myBet: pendingBet,
        serverTime: clock.serverNow(),
      }),
    );

    expect(cashButton().disabled).toBe(false);
  });

  it('CO3: o round:crashed desabilita o Sacar na hora', () => {
    const { store } = setup({ round: running(), myBet: pendingBet });
    act(() =>
      store.receive({
        type: 'round:crashed',
        payload: {
          roundId: ROUND,
          crashPoint: 150,
          serverSeed: 's'.repeat(64),
        },
        serverTime: clock.serverNow(),
      }),
    );
    expect(cashButton().disabled).toBe(true);
  });

  it('RQ3: durante o POST /cashout o Sacar fica desabilitado, e clique duplo gera uma requisição só', async () => {
    const response = held();
    const { calls } = setup({
      round: running(),
      myBet: pendingBet,
      responders: [response.responder],
    });
    fireEvent.click(cashButton());
    fireEvent.click(cashButton());
    expect(cashButton().disabled).toBe(true);
    expect(calls).toHaveLength(1);
    response.release(200, cashed);
    await waitFor(() => expect(screen.getByText(/Você sacou/)).toBeTruthy());
  });

  it('RQ3b: a trava do próprio painel segura o segundo clique do Sacar', () => {
    let finish!: (result: ActionResult) => void;
    const cashOut = vi.fn(
      () => new Promise<ActionResult>((resolve) => (finish = resolve)),
    );
    setup({
      round: running(),
      myBet: pendingBet,
      actions: fakeActions({ cashOut }),
    });
    fireEvent.click(cashButton());
    fireEvent.click(cashButton());
    expect(cashOut).toHaveBeenCalledTimes(1);
    act(() => finish({ status: 'done' }));
  });
});

describe('BetPanel: erros, saldo e situação da aposta (D78)', () => {
  it('ER1: os erros aparecem em role="alert" com a mensagem da tabela, nunca a do servidor', async () => {
    setup({ responders: [apiError(422, 'INSUFFICIENT_BALANCE')] });
    type('10');
    fireEvent.click(betButton());
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Saldo insuficiente.',
    );
  });

  it('ER1: 409 TOO_LATE no Sacar mostra "Tarde demais"', async () => {
    setup({
      round: running(),
      myBet: pendingBet,
      responders: [apiError(409, 'TOO_LATE')],
    });
    fireEvent.click(cashButton());
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Tarde demais: a rodada já crashou.',
    );
  });

  it('ER2: o alerta some na próxima tentativa', async () => {
    const second = held();
    setup({
      responders: [apiError(422, 'INSUFFICIENT_BALANCE'), second.responder],
    });
    type('10');
    fireEvent.click(betButton());
    await screen.findByRole('alert');

    fireEvent.click(betButton());
    expect(alert()).toBeNull();
    second.release(201, placed);
  });

  it('ER2: o alerta também some quando chega um round:betting (o "tarde demais" não atravessa de rodada)', async () => {
    const { store } = setup({
      round: running(),
      myBet: pendingBet,
      responders: [apiError(409, 'TOO_LATE')],
    });
    fireEvent.click(cashButton());
    await screen.findByRole('alert');

    const next: WsMessage = {
      type: 'round:betting',
      payload: {
        roundId: NEXT,
        seedHash: 'h'.repeat(64),
        bettingEndsAt: clock.serverNow() + 10_000,
      },
      serverTime: clock.serverNow(),
    };
    act(() => store.receive(next));

    expect(alert()).toBeNull();
  });

  it('ER3: o saldo do cabeçalho vem das respostas do POST /bets e do cash out', async () => {
    const { container, store } = setup({
      responders: [json(201, placed), json(200, cashed)],
    });
    type('10');
    fireEvent.click(betButton());
    await waitFor(() => expect(container.textContent).toContain('990,00'));

    act(() =>
      store.receive({
        type: 'round:started',
        payload: { roundId: ROUND, startedAt: clock.serverNow() },
        serverTime: clock.serverNow(),
      }),
    );
    fireEvent.click(cashButton());
    await waitFor(() => expect(container.textContent).toContain('1.008,20'));
  });

  it.each([
    ['PENDING', pendingBet, 'Sua aposta: 10,00'],
    [
      'CASHED_OUT',
      {
        ...pendingBet,
        status: 'CASHED_OUT' as const,
        cashoutMultiplier: 182,
        payout: 1_820,
      },
      'Você sacou em 1,82x: 18,20',
    ],
    ['LOST', { ...pendingBet, status: 'LOST' as const }, 'Não foi desta vez'],
  ])('MB1: myBet %s', (_status, myBet, text) => {
    setup({ round: running(), myBet });
    expect(screen.getByText(text)).toBeTruthy();
  });
});
