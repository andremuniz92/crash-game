import { Wallet } from '../domain/wallet.js';
import type { WalletRepository } from '../domain/wallet-repository.js';

/** O que `openWallet` precisa da transação de quem chama (D56). */
export interface OpenWalletTx {
  wallets: WalletRepository;
}

/** Abre a carteira com o saldo inicial e grava uma vez (D53). */
export async function openWallet(
  tx: OpenWalletTx,
  playerId: string,
  now: number,
): Promise<Wallet> {
  const wallet = Wallet.open({ playerId, now });
  await tx.wallets.save(wallet);
  return wallet;
}
