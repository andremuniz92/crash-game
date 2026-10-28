import type { Wallet } from './wallet.js';

/** Persistência das carteiras (D38). Implementação no M2. */
export interface WalletRepository {
  /** Carrega com lock pessimista (`SELECT ... FOR UPDATE`, seções 10.1 e 10.2). */
  getForUpdate(playerId: string): Promise<Wallet>;
  save(wallet: Wallet): Promise<void>;
}
