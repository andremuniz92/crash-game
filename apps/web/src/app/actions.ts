import type { ClientErrorCode, CurrentRoundResponse } from '@crash/shared';
import { type ApiClient, ApiError } from '../net/api-client.js';
import { withRetry } from '../net/retry.js';
import {
  applyBetPlaced,
  applyCashedOut,
  type GameState,
  setHistory,
  setPending,
  signIn,
  signOut,
} from '../store/game-state.js';
import type { GameStore } from '../store/game-store.js';
import { errorMessage } from './error-messages.js';
import type { SessionStorage } from './session.js';

/** Resultado para a tela: a mensagem já vem pronta (D78). */
export type ActionResult =
  | { status: 'done' }
  | { status: 'failed'; message: string }
  /** Já havia uma ação igual em andamento; nenhuma requisição saiu. */
  | { status: 'ignored' };

export interface Actions {
  createGuest(nickname: string): Promise<ActionResult>;
  restoreSession(): Promise<void>;
  placeBet(amount: number): Promise<ActionResult>;
  cashOut(): Promise<ActionResult>;
  /** GET /rounds/history mesclado ao que o WS trouxe; falha de rede não apaga nada. */
  loadHistory(): Promise<void>;
  /**
   * Para a conexão (D76): busca o snapshot sem aplicar na store, porque a
   * conexão aplica na ordem certa e descarta GET de conexão antiga. Rejeita,
   * e quem chama decide o backoff.
   */
  fetchSnapshot(signal?: AbortSignal): Promise<CurrentRoundResponse>;
}

/** 409 que mostram o estado local errado: a tela precisa ressincronizar (D78). */
const STATE_CONFLICTS = new Set<ClientErrorCode>([
  'ROUND_NOT_ACCEPTING_BETS',
  'BET_ALREADY_PLACED',
  'ROUND_NOT_RUNNING',
  'BET_NOT_PENDING',
  'TOO_LATE',
]);

/**
 * Ações do jogador (D83): o único lugar que liga a rede e a store. Cada
 * clique gera uma Idempotency-Key, reaproveitada nas retentativas.
 */
export function createActions({
  api,
  store,
  session,
  newKey,
  resync,
  sleep,
}: {
  api: ApiClient;
  store: GameStore;
  session: SessionStorage;
  /** `crypto.randomUUID()` em produção. */
  newKey: () => string;
  /** Ressincronização da conexão (D76). */
  resync: () => void;
  sleep?: (ms: number) => Promise<void>;
}): Actions {
  const update = (change: (state: GameState) => GameState) =>
    store.setState(change, true);

  function forget(): void {
    session.clear();
    update(signOut);
  }

  function failure(error: unknown): ActionResult {
    if (error instanceof ApiError) {
      if (error.status === 401) forget();
      if (
        error.status === 409 &&
        STATE_CONFLICTS.has(error.code as ClientErrorCode)
      ) {
        resync();
      }
    }
    return { status: 'failed', message: errorMessage(error) };
  }

  /** Trava por ação: botão desabilitado e nada de requisição em dobro (D78). */
  async function guarded(
    action: keyof GameState['pending'],
    run: () => Promise<void>,
  ): Promise<ActionResult> {
    if (store.getState().pending[action]) return { status: 'ignored' };
    update((state) => setPending(state, action, true));
    try {
      await run();
      return { status: 'done' };
    } catch (error) {
      return failure(error);
    } finally {
      update((state) => setPending(state, action, false));
    }
  }

  return {
    async createGuest(nickname) {
      try {
        // Sem Idempotency-Key: repetir criaria outro jogador, então não retenta.
        const guest = await api.createGuest(nickname);
        session.save({
          playerId: guest.playerId,
          nickname: guest.nickname,
          token: guest.token,
        });
        update((state) =>
          signIn(
            state,
            { playerId: guest.playerId, nickname: guest.nickname },
            guest.balance,
          ),
        );
        return { status: 'done' };
      } catch (error) {
        return failure(error);
      }
    },

    async restoreSession() {
      const saved = session.load();
      if (!saved) return;
      try {
        const wallet = await api.wallet(saved.token);
        update((state) =>
          signIn(
            state,
            { playerId: saved.playerId, nickname: saved.nickname },
            wallet.balance,
          ),
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) forget();
      }
    },

    placeBet(amount) {
      return guarded('bet', async () => {
        const saved = session.load();
        if (!saved) throw new ApiError(401, 'UNAUTHORIZED', 'sem sessão');
        const key = newKey();
        const response = await withRetry(
          () => api.placeBet(saved.token, amount, key),
          { sleep },
        );
        update((state) => applyBetPlaced(state, response));
      });
    },

    cashOut() {
      const { myBet } = store.getState();
      if (myBet?.status !== 'PENDING') {
        return Promise.resolve({ status: 'ignored' });
      }
      return guarded('cashOut', async () => {
        const saved = session.load();
        if (!saved) throw new ApiError(401, 'UNAUTHORIZED', 'sem sessão');
        const key = newKey();
        const response = await withRetry(
          () => api.cashOut(saved.token, myBet.betId, key),
          { sleep },
        );
        update((state) => applyCashedOut(state, response));
      });
    },

    async loadHistory() {
      try {
        const items = await api.history();
        update((state) => setHistory(state, items));
      } catch {
        // Fica o que já havia; a próxima chegada a live tenta de novo.
      }
    },

    async fetchSnapshot(signal) {
      const saved = session.load();
      try {
        return await api.currentRound(saved?.token ?? null, signal);
      } catch (error) {
        // Token recusado: some a sessão e o GET é refeito sem Bearer, uma vez (D77).
        if (!(saved && error instanceof ApiError && error.status === 401)) {
          throw error;
        }
        forget();
        return await api.currentRound(null, signal);
      }
    },
  };
}
