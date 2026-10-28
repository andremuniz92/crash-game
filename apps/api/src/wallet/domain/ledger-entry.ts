export type LedgerEntryType = 'INITIAL_GRANT' | 'BET_PLACED' | 'CASHOUT';

/**
 * Lançamento do extrato (seção 6.4). Objeto de valor sem id: o banco gera
 * o id (D37). `amount` é em centavos com sinal: débito é negativo.
 */
export interface LedgerEntry {
  readonly type: LedgerEntryType;
  readonly amount: number;
  readonly betId: string | null;
  readonly createdAt: number;
}
