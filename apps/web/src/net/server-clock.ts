/**
 * Relógio do servidor estimado no cliente (D74). Cada mensagem dá uma amostra
 * `serverTime − recebidoEm`; como o servidor lê o `serverTime` no envio, toda
 * amostra é o offset real menos a latência de ida, um limite inferior. A
 * melhor estimativa é o máximo das amostras recentes.
 */
export interface ServerClock {
  /** `receivedAt` no relógio local monotônico, lido quando a mensagem chegou. */
  sample(serverTime: number, receivedAt: number): void;
  /** Ressincronização: descarta as amostras e recomeça pela do snapshot. */
  restart(serverTime: number, receivedAt: number): void;
  offset(): number;
  serverNow(): number;
}

interface Sample {
  offset: number;
  receivedAt: number;
}

export function createServerClock({
  now,
  windowMs = 10_000,
}: {
  /** Relógio local monotônico: `performance.now()` em produção. */
  now: () => number;
  windowMs?: number;
}): ServerClock {
  let samples: Sample[] = [];
  // Com a janela vazia, fica a última estimativa (D74).
  let estimate = 0;

  function sample(serverTime: number, receivedAt: number): void {
    samples.push({ offset: serverTime - receivedAt, receivedAt });
    // A estimativa acompanha cada amostra, mesmo que ninguém leia o offset
    // antes de ela sair da janela.
    offset();
  }

  function offset(): number {
    const oldest = now() - windowMs;
    samples = samples.filter((s) => s.receivedAt >= oldest);
    if (samples.length > 0) {
      estimate = Math.max(...samples.map((s) => s.offset));
    }
    return estimate;
  }

  return {
    sample,
    restart(serverTime, receivedAt) {
      samples = [];
      sample(serverTime, receivedAt);
    },
    offset,
    serverNow: () => now() + offset(),
  };
}
