import type {
  CashOutResponse,
  CurrentRoundResponse,
  GuestResponse,
  PlaceBetResponse,
  RoundHistoryItem,
  VerifyResponse,
  WalletResponse,
} from '@crash/shared';

/** Resposta 4xx ou 5xx da API, no formato { code, message } (seção 8.1). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A requisição não chegou a ter resposta: rede fora ou 10 s sem resposta. */
export class NetworkError extends Error {
  constructor(
    readonly kind: 'network' | 'timeout',
    message: string,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Uma função por rota da seção 8.1. O token vai explícito em cada chamada. */
export interface ApiClient {
  createGuest(nickname: string): Promise<GuestResponse>;
  currentRound(
    token: string | null,
    signal?: AbortSignal,
  ): Promise<CurrentRoundResponse>;
  wallet(token: string): Promise<WalletResponse>;
  history(): Promise<RoundHistoryItem[]>;
  verify(roundId: string): Promise<VerifyResponse>;
  placeBet(
    token: string,
    amount: number,
    key: string,
  ): Promise<PlaceBetResponse>;
  cashOut(token: string, betId: string, key: string): Promise<CashOutResponse>;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  token?: string | null;
  body?: unknown;
  idempotencyKey?: string;
  /** Cancelamento por quem chama (dispose da conexão, D76). */
  signal?: AbortSignal;
}

export function createApiClient({
  baseUrl,
  fetch,
  timeoutMs = 10_000,
}: {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  timeoutMs?: number;
}): ApiClient {
  async function request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.body !== undefined)
      headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey)
      headers['Idempotency-Key'] = options.idempotencyKey;

    // Um controlador só para o timeout e o sinal de fora; a flag diz qual abortou.
    // Sem AbortSignal.any, que exigiria Safari 17.4 e Chrome 116.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const cancel = () => controller.abort();
    if (options.signal?.aborted) cancel();
    options.signal?.addEventListener('abort', cancel);
    try {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method: options.method ?? 'GET',
          headers,
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
          signal: controller.signal,
        });
      } catch {
        if (timedOut) {
          throw new NetworkError('timeout', `sem resposta em ${timeoutMs} ms`);
        }
        if (controller.signal.aborted) {
          throw new DOMException('requisição cancelada', 'AbortError');
        }
        throw new NetworkError('network', 'falha de rede');
      }
      if (!response.ok) throw await toApiError(response);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }

  return {
    createGuest: (nickname) =>
      request('/players/guest', { method: 'POST', body: { nickname } }),
    currentRound: (token, signal) =>
      request('/rounds/current', { token, signal }),
    wallet: (token) => request('/wallet', { token }),
    history: () => request('/rounds/history'),
    verify: (roundId) =>
      request(`/rounds/${encodeURIComponent(roundId)}/verify`),
    placeBet: (token, amount, idempotencyKey) =>
      request('/bets', {
        method: 'POST',
        token,
        body: { amount },
        idempotencyKey,
      }),
    cashOut: (token, betId, idempotencyKey) =>
      request(`/bets/${encodeURIComponent(betId)}/cashout`, {
        method: 'POST',
        token,
        idempotencyKey,
      }),
  };
}

/** Corpo { code, message } da API; sem ele (proxy, página HTML), HTTP_ERROR. */
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof body.code === 'string' &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return new ApiError(response.status, body.code, body.message);
    }
  } catch {
    // Corpo que não é JSON: cai no HTTP_ERROR abaixo.
  }
  return new ApiError(response.status, 'HTTP_ERROR', `HTTP ${response.status}`);
}
