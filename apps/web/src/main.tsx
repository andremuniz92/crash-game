import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './ui/tokens.css';
import './ui/base.css';
import { createActions } from './app/actions.js';
import { createFrameLoop } from './app/frame-loop.js';
import { GameProvider } from './app/game-context.js';
import { createIdempotencyKey } from './app/idempotency-key.js';
import { whenLive } from './app/when-live.js';
import { createSessionStorage, type KeyValueStorage } from './app/session.js';
import { readWebConfig } from './config.js';
import { createApiClient } from './net/api-client.js';
import {
  type Connection,
  createConnection,
  type SocketLike,
} from './net/connection.js';
import { createServerClock } from './net/server-clock.js';
import { createGameStore } from './store/game-store.js';

/*
 * Composition root (D75, D83): store, relógio, rede e conexão nascem uma vez,
 * fora do React. Assim o StrictMode, que monta tudo duas vezes em dev, não
 * abre dois WebSockets.
 */
const config = readWebConfig(import.meta.env);
const now = () => performance.now();
const store = createGameStore();
const clock = createServerClock({ now });
const frames = createFrameLoop({ clock });
const api = createApiClient({
  baseUrl: config.apiUrl,
  // Chamado solto, o fetch do navegador lança "Illegal invocation".
  fetch: (input, init) => fetch(input, init),
});

/** Até ler o `localStorage` pode lançar (bloqueio do navegador). */
function browserStorage(): KeyValueStorage {
  try {
    return window.localStorage;
  } catch {
    const blocked = () => {
      throw new DOMException('localStorage indisponível', 'SecurityError');
    };
    return { getItem: blocked, setItem: blocked, removeItem: blocked };
  }
}

/** O WebSocket do navegador no formato que a conexão usa. */
function browserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const socket: SocketLike = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    close: () => ws.close(),
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (event) => socket.onmessage?.({ data: event.data });
  ws.onclose = () => socket.onclose?.();
  ws.onerror = () => socket.onerror?.();
  return socket;
}

let connection: Connection | null = null;
const actions = createActions({
  api,
  store,
  session: createSessionStorage(browserStorage()),
  newKey: () => createIdempotencyKey(),
  resync: () => connection?.resync(),
  // Fora de HTTPS e localhost, o navegador não oferece o subtle (D80).
  subtle: globalThis.crypto?.subtle,
});
connection = createConnection({
  url: config.wsUrl,
  createSocket: browserSocket,
  fetchSnapshot: (signal) => actions.fetchSnapshot(signal),
  store,
  clock,
  now,
  random: Math.random,
  onOnline: (listener) => {
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
});

if (import.meta.env.DEV) {
  // Para acompanhar o WS no console durante o desenvolvimento (D76).
  store.subscribe((state, previous) => {
    if (state.connection !== previous.connection) {
      console.info(`[ws] ${previous.connection} → ${state.connection}`);
    }
    if (state.round?.status !== previous.round?.status) {
      console.info(`[rodada] ${state.round?.status ?? '—'}`, state.round);
    }
  });
}

void actions.restoreSession();
whenLive(store, () => void actions.loadHistory());
connection.start();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Elemento #root não encontrado no index.html');
}

createRoot(container).render(
  <StrictMode>
    <GameProvider value={{ store, actions, clock, frames }}>
      <App />
    </GameProvider>
  </StrictMode>,
);
