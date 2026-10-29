/**
 * Embrulha qualquer objeto com `subscribe` e conta as assinaturas ainda
 * ativas: soma na assinatura e subtrai no primeiro cancelamento (o segundo
 * não conta de novo).
 */
export function trackSubscriptions<
  L,
  T extends { subscribe(listener: L): () => void },
>(target: T): { loop: T; live: () => number } {
  let live = 0;
  const loop: T = {
    ...target,
    subscribe(listener: L) {
      const unsubscribe = target.subscribe(listener);
      live++;
      let cancelled = false;
      return () => {
        if (!cancelled) {
          cancelled = true;
          live--;
        }
        unsubscribe();
      };
    },
  };
  return { loop, live: () => live };
}
