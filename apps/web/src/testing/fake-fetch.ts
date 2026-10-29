/** Uma chamada registrada pelo `fakeFetch`. */
export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = (
  call: FetchCall,
  signal: AbortSignal | undefined,
) => Promise<Response>;

/**
 * `fetch` falso (D82): responde com a fila de respostas roteirizadas, na
 * ordem, e registra cada chamada. Sem rede e sem MSW.
 */
export function fakeFetch(...responders: Responder[]) {
  const calls: FetchCall[] = [];
  const fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const call: FetchCall = {
      url:
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    };
    calls.push(call);
    const responder = responders.shift();
    if (!responder)
      throw new Error(
        `chamada sem resposta roteirizada: ${call.method} ${call.url}`,
      );
    return responder(call, init.signal ?? undefined);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

export const json =
  (status: number, body: unknown): Responder =>
  () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

export const html =
  (status: number): Responder =>
  () =>
    Promise.resolve(new Response('<html>Bad Gateway</html>', { status }));

/** Falha de rede: o `fetch` real rejeita com TypeError. */
export const offline: Responder = () =>
  Promise.reject(new TypeError('Failed to fetch'));

/** Nunca responde; rejeita quando o sinal aborta, como o `fetch` real. */
export const hang: Responder = (_call, signal) =>
  new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () =>
      reject(new DOMException('The operation was aborted.', 'AbortError')),
    );
  });
