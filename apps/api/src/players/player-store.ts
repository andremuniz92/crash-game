/** Jogador identificado pelo token (D59). */
export interface AuthenticatedPlayer {
  id: string;
  nickname: string;
}

export interface NewPlayer {
  id: string;
  nickname: string;
  tokenHash: string;
  createdAt: number;
}

/** Tabela `players`. Sem DDD (seção 5): só grava e busca. */
export interface PlayerStore {
  insert(player: NewPlayer): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<AuthenticatedPlayer | null>;
}
