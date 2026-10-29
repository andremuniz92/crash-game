import type { CurrentRoundResponse, WsMessage } from '@crash/shared';
import { setConnection } from '../store/game-state.js';
import type { GameStore } from '../store/game-store.js';
import { backoffDelay } from './backoff.js';
import type { ServerClock } from './server-clock.js';
import { parseWsMessage } from './ws-message.js';

/** O pedaço do WebSocket do navegador que a conexão usa. */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface Connection {
  start(): void;
  /** Ressincronização pedida de fora (409 de estado, D78): mesmo socket. */
  resync(): void;
  dispose(): void;
}

interface Buffered {
  message: WsMessage;
  receivedAt: number;
}

/**
 * Conexão WS (D76). Um caminho só para a primeira conexão, a reconexão e a
 * ressincronização: abrir → syncing → GET /rounds/current → restart do
 * relógio → snapshot na store → buffer → live. Qualquer falha fecha o socket
 * e espera o backoff; o backoff só zera ao chegar a live.
 */
export function createConnection({
  url,
  createSocket,
  fetchSnapshot,
  store,
  clock,
  now,
  random,
  onOnline,
  openTimeoutMs = 10_000,
  silenceMs = 30_000,
}: {
  url: string;
  createSocket: (url: string) => SocketLike;
  fetchSnapshot: (signal: AbortSignal) => Promise<CurrentRoundResponse>;
  store: GameStore;
  clock: ServerClock;
  /** Relógio local monotônico: `performance.now()` em produção. */
  now: () => number;
  random: () => number;
  /** Inscreve no evento `online` do navegador; devolve a desinscrição. */
  onOnline: (listener: () => void) => () => void;
  openTimeoutMs?: number;
  silenceMs?: number;
}): Connection {
  let socket: SocketLike | null = null;
  /** Muda a cada socket: handler de socket antigo não faz nada. */
  let generation = 0;
  /** A sincronização em andamento; a identidade dela é a geração do GET. */
  let sync: AbortController | null = null;
  /** Não nulo durante a syncing. */
  let buffer: Buffered[] | null = null;
  let attempts = 0;
  let lastMessageAt = 0;
  let backoffTimer: ReturnType<typeof setTimeout> | undefined;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let stopOnline: (() => void) | null = null;

  const status = (value: Parameters<typeof setConnection>[1]) =>
    store.setState((state) => setConnection(state, value), true);

  function connect(): void {
    clearTimeout(backoffTimer);
    backoffTimer = undefined;
    const current = ++generation;
    status('connecting');
    const ws = createSocket(url);
    socket = ws;
    // Handshake pendurado (rede ruim de celular): nem open nem close.
    openTimer = setTimeout(() => {
      if (current === generation) fail();
    }, openTimeoutMs);
    ws.onopen = () => {
      if (current !== generation) return;
      clearTimeout(openTimer);
      lastMessageAt = now();
      watchSilence();
      void synchronize();
    };
    ws.onmessage = (event) => {
      if (current === generation) receive(String(event.data));
    };
    // O navegador manda error e depois close; só o close agenda a reconexão.
    ws.onerror = () => undefined;
    ws.onclose = () => {
      if (current === generation) fail();
    };
  }

  /** Larga o socket atual sem reagir aos eventos dele. */
  function teardown(): void {
    generation++;
    sync?.abort();
    sync = null;
    buffer = null;
    clearTimeout(openTimer);
    clearTimeout(silenceTimer);
    const old = socket;
    socket = null;
    old?.close();
  }

  function fail(): void {
    teardown();
    status('waiting');
    backoffTimer = setTimeout(connect, backoffDelay(attempts++, random));
  }

  async function synchronize(): Promise<void> {
    const controller = new AbortController();
    sync = controller;
    buffer = [];
    status('syncing');
    let snapshot: CurrentRoundResponse;
    try {
      snapshot = await fetchSnapshot(controller.signal);
    } catch {
      if (sync === controller) fail();
      return;
    }
    // GET de uma sincronização que não é mais a atual: não aplica nada.
    if (sync !== controller) return;
    clock.restart(snapshot.serverTime, now());
    store.load(snapshot);
    const pending = buffer;
    sync = null;
    buffer = null;
    for (const { message, receivedAt } of pending) {
      clock.sample(message.serverTime, receivedAt);
      // Publicado antes do snapshot: já está nele, e reaplicar faria a rodada voltar.
      if (message.serverTime >= snapshot.serverTime) store.receive(message);
    }
    attempts = 0;
    status('live');
  }

  function receive(text: string): void {
    const receivedAt = now();
    lastMessageAt = receivedAt;
    const message = parseWsMessage(text);
    if (!message) return;
    if (buffer) {
      buffer.push({ message, receivedAt });
      return;
    }
    clock.sample(message.serverTime, receivedAt);
    store.receive(message);
  }

  /** Prazo do silêncio, no relógio local: em BETTING, até o fim das apostas + 30 s. */
  function silenceDeadline(): number {
    const deadline = lastMessageAt + silenceMs;
    const { round } = store.getState();
    if (round?.status !== 'BETTING') return deadline;
    return Math.max(deadline, round.bettingEndsAt - clock.offset() + silenceMs);
  }

  /**
   * Um timer só, conferido no disparo: timer atrasado (aba em segundo plano)
   * nunca fecha antes do prazo, porque o prazo é recalculado aqui.
   */
  function watchSilence(): void {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(
      () => {
        const remaining = silenceDeadline() - now();
        if (remaining <= 0) fail();
        else watchSilence();
      },
      Math.max(0, silenceDeadline() - now()),
    );
  }

  return {
    start() {
      stopOnline = onOnline(() => {
        // Só em waiting: as outras fases já têm socket.
        if (socket === null) connect();
      });
      connect();
    },
    resync() {
      const { connection } = store.getState();
      if (socket !== null && sync === null && connection === 'live') {
        void synchronize();
      }
    },
    dispose() {
      teardown();
      clearTimeout(backoffTimer);
      backoffTimer = undefined;
      stopOnline?.();
      stopOnline = null;
    },
  };
}
