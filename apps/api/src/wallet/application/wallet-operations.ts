import type { Money } from '../../shared/domain/money.js';
import type { WalletRepository } from '../domain/wallet-repository.js';

export interface WalletOperationsTx {
  wallets: WalletRepository;
}

/** Carrega com lock, debita e grava uma vez (D53). Devolve o saldo novo. */
export async function debitForBet(
  tx: WalletOperationsTx,
  playerId: string,
  amount: Money,
  betId: string,
  now: number,
): Promise<Money> {
  const wallet = await tx.wallets.getForUpdate(playerId);
  wallet.debit(amount, { betId, now });
  await tx.wallets.save(wallet);
  return wallet.balance;
}

/** Carrega com lock, credita e grava uma vez (D53). Devolve o saldo novo. */
export async function creditForCashout(
  tx: WalletOperationsTx,
  playerId: string,
  payout: Money,
  betId: string,
  now: number,
): Promise<Money> {
  const wallet = await tx.wallets.getForUpdate(playerId);
  wallet.credit(payout, { betId, now });
  await tx.wallets.save(wallet);
  return wallet.balance;
}
