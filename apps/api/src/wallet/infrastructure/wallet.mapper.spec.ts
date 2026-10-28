import { Money } from '../../shared/domain/money.js';
import { Wallet } from '../domain/wallet.js';
import {
  ledgerEntryToRecord,
  walletToDomain,
  walletToRecord,
} from './wallet.mapper.js';

const PLAYER = 'c1c1c1c1-0000-4000-8000-000000000001';
const NOW = 1_700_000_000_000;

describe('wallet.mapper', () => {
  it('walletToRecord gera playerId, saldo em centavos e versão; walletToDomain reconstrói', () => {
    const wallet = Wallet.restore({
      playerId: PLAYER,
      balance: Money.fromCents(4_321),
      version: 7,
    });
    const row = walletToRecord(wallet);
    expect(row).toEqual({ playerId: PLAYER, balance: 4_321, version: 7 });

    const restored = walletToDomain(row);
    expect(restored.playerId).toBe(PLAYER);
    expect(restored.balance.cents).toBe(4_321);
    expect(restored.version).toBe(7);
  });

  it('ledgerEntryToRecord converte tipo, valor com sinal, betId e data', () => {
    const wallet = Wallet.open({ playerId: PLAYER, now: NOW });
    wallet.debit(Money.fromCents(1_000), { betId: 'bet-1', now: NOW + 5 });
    const [grant, debit] = wallet.pullNewEntries();

    expect(ledgerEntryToRecord(PLAYER, grant!)).toEqual({
      playerId: PLAYER,
      type: 'INITIAL_GRANT',
      amount: 100_000,
      betId: null,
      createdAt: new Date(NOW),
    });
    expect(ledgerEntryToRecord(PLAYER, debit!)).toEqual({
      playerId: PLAYER,
      type: 'BET_PLACED',
      amount: -1_000,
      betId: 'bet-1',
      createdAt: new Date(NOW + 5),
    });
  });
});
