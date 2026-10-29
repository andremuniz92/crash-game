import type {
  ClientErrorCode,
  CurrentRoundResponse,
  VerifyResponse,
  WalletResponse,
} from '@crash/shared';
import { type ApiClient, ApiError } from '../net/api-client.js';
import { withRetry } from '../net/retry.js';
import {
  applyBetPlaced,
  applyCashedOut,
  type GameState,
  publishedHashOf,
  setBalance,
  setHistory,
  setPending,
  signIn,
  signOut,
} from '../store/game-state.js';
import type { GameStore } from '../store/game-store.js';
import { errorMessage } from './error-messages.js';
import type { SessionStorage } from './session.js';
import { sha256Hex } from './sha256.js';

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
  /** GET /wallet: saldo e os últimos lançamentos; atualiza o saldo da store. */
  loadWallet(): Promise<WalletResult>;
  /** GET /rounds/:id/verify e o SHA-256 da seed contra o hash publicado antes (D80, D86). */
  verifyRound(roundId: string): Promise<VerifyResult>;
  /**
   * Para a conexão (D76): busca o snapshot sem aplicar na store, porque a
   * conexão aplica na ordem certa e descarta GET de conexão antiga. Rejeita,
   * e quem chama decide o backoff.
   */
  fetchSnapshot(signal?: AbortSignal): Promise<CurrentRoundResponse>;
}

export type WalletResult =
  | { status: 'done'; wallet: WalletResponse }
  | { status: 'failed'; message: string };

/** Resultado da verificação de uma rodada (D80, D86). */
export type VerifyResult =
  | { status: 'failed'; message: string }
  | {
      status: 'done';
      serverSeed: string;
      /** O hash contra o qual a seed foi conferida. */
      seedHash: string;
      crashPoint: number;
      /** A página viu o hash publicado antes do crash. */
      seenLive: boolean;
      /** null: sem crypto.subtle (contexto inseguro). */
      hashMatches: boolean | null;
    };

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
  subtle,
}: {
  api: ApiClient;
  store: GameStore;
  session: SessionStorage;
  /** `crypto.randomUUID()` em produção. */
  newKey: () => string;
  /** Ressincronização da conexão (D76). */
  resync: () => void;
  sleep?: (ms: number) => Promise<void>;
  /** crypto.subtle; ausente fora de HTTPS e localhost. */
  subtle?: SubtleCrypto;
}): Actions {
  const update = (change: (state: GameState) => GameState) =>
    store.setState(change, true);

  function forget(): void {
    session.clear();
    update(signOut);
  }

  function failure(
    error: unknown,
  ): Extract<ActionResult, { status: 'failed' }> {
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

    async loadWallet() {
      const saved = session.load();
      if (!saved) return { status: 'failed', message: errorMessage(null) };
      try {
        const wallet = await api.wallet(saved.token);
        update((state) => setBalance(state, wallet.balance));
        return { status: 'done', wallet };
      } catch (error) {
        return failure(error);
      }
    },

    async verifyRound(roundId) {
      let response: VerifyResponse;
      try {
        response = await api.verify(roundId);
      } catch (error) {
        return { status: 'failed', message: errorMessage(error) };
      }
      // A garantia é a seed bater com o hash publicado antes do crash (D86);
      // sem ele, só resta o da própria resposta.
      const published = publishedHashOf(store.getState(), roundId);
      const seedHash = published ?? response.seedHash;
      const hashMatches = subtle
        ? (await sha256Hex(response.serverSeed, subtle)) === seedHash
        : null;
      return {
        status: 'done',
        serverSeed: response.serverSeed,
        seedHash,
        crashPoint: response.crashPoint,
        seenLive: published !== null,
        hashMatches,
      };
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
