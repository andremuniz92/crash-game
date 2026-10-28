import { DomainError } from '../domain/domain-error.js';

/** A mesma chave veio com outro endpoint ou outro corpo (D60). */
export class IdempotencyKeyReusedError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
}

export interface IdempotencyRecord {
  playerId: string;
  key: string;
  endpoint: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: number;
}

/** Tabela `idempotency_keys` (D60). Todos os métodos exigem a transação do caso de uso. */
export interface IdempotencyStore {
  /** Serializa as requisições com a mesma chave do mesmo jogador até o fim da transação. */
  lock(playerId: string, key: string): Promise<void>;
  find(playerId: string, key: string): Promise<IdempotencyRecord | null>;
  save(record: IdempotencyRecord): Promise<void>;
}

export interface IdempotentRequest {
  playerId: string;
  key: string;
  endpoint: string;
  requestHash: string;
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  /** true quando a resposta veio do registro salvo. */
  replayed: boolean;
}

/**
 * Aplica a D60 dentro da transação do caso de uso: trava a chave, devolve a
 * resposta salva se a mesma operação já aconteceu e, senão, roda `work` e
 * salva o sucesso. Erro não é salvo: a transação desfaz tudo e a chave pode
 * ser usada de novo.
 */
export async function idempotent<T>(
  store: IdempotencyStore,
  request: IdempotentRequest,
  options: { now: number; status: number },
  work: () => Promise<T>,
): Promise<IdempotentResult<T>> {
  await store.lock(request.playerId, request.key);
  const saved = await store.find(request.playerId, request.key);
  if (saved) {
    if (
      saved.endpoint !== request.endpoint ||
      saved.requestHash !== request.requestHash
    ) {
      throw new IdempotencyKeyReusedError(
        'a Idempotency-Key já foi usada em outra operação',
      );
    }
    return {
      status: saved.responseStatus,
      body: saved.responseBody as T,
      replayed: true,
    };
  }

  const body = await work();
  await store.save({
    ...request,
    responseStatus: options.status,
    responseBody: body,
    createdAt: options.now,
  });
  return { status: options.status, body, replayed: false };
}
