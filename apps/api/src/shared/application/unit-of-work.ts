/**
 * Fronteira de transação (D56). `work` recebe as dependências da transação
 * corrente; cada caso de uso tipa só as que usa.
 */
export interface UnitOfWork<Tx> {
  run<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
}
