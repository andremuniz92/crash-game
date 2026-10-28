import { DomainError } from '../../shared/domain/domain-error.js';
import type { Wallet } from './wallet.js';

/** Todo jogador tem carteira: a ausência indica bug (D53). */
export class WalletNotFoundError extends DomainError {
  readonly code = 'WALLET_NOT_FOUND';
}

/** A versão gravada mudou desde o carregamento: segunda barreira da D45 (D53). */
export class WalletVersionConflictError extends DomainError {
  readonly code = 'WALLET_VERSION_CONFLICT';
}

/** Persistência das carteiras (D38, D53). */
export interface WalletRepository {
  /**
   * Carrega com lock pessimista (`SELECT ... FOR UPDATE`, seções 10.1 e 10.2).
   * Lança `WalletNotFoundError` se o jogador não tiver carteira.
   */
  getForUpdate(playerId: string): Promise<Wallet>;
  /** Uma gravação por carregamento; versão desatualizada lança `WalletVersionConflictError`. */
  save(wallet: Wallet): Promise<void>;
}
