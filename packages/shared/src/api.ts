/* Contrato REST (seção 8.1). Dinheiro em centavos, instantes em ms (D63). */

export interface ErrorResponse {
  code: string;
  message: string;
}

export interface GuestRequest {
  nickname: string;
}

export interface GuestResponse {
  playerId: string;
  nickname: string;
  token: string;
  balance: number;
}

export type LedgerEntryType = 'INITIAL_GRANT' | 'BET_PLACED' | 'CASHOUT';

export interface LedgerEntryDto {
  type: LedgerEntryType;
  /** Centavos com sinal: débito é negativo. */
  amount: number;
  betId: string | null;
  createdAt: number;
}

export interface WalletResponse {
  balance: number;
  /** Os 20 lançamentos mais recentes, do mais novo para o mais antigo. */
  entries: LedgerEntryDto[];
}
