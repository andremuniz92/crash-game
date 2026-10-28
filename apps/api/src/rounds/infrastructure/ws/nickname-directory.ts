/**
 * Cache id → nickname do `bet:placed` e do `bet:cashed_out` (D62). O
 * nickname não muda, então o cache não expira; guarda a promessa para que
 * pedidos simultâneos do mesmo jogador façam uma consulta só.
 */
export class NicknameDirectory {
  private readonly cache = new Map<string, Promise<string>>();

  constructor(private readonly lookup: (playerId: string) => Promise<string>) {}

  nicknameOf(playerId: string): Promise<string> {
    const cached = this.cache.get(playerId);
    if (cached) return cached;
    const pending = this.lookup(playerId).catch((error: unknown) => {
      this.cache.delete(playerId);
      throw error;
    });
    this.cache.set(playerId, pending);
    return pending;
  }
}
