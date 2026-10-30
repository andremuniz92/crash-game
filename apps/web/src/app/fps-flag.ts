/** O medidor de fps liga com o parâmetro `fps` na URL (D97). */
export function fpsEnabled(search: string): boolean {
  return new URLSearchParams(search).has('fps');
}

/** Só chama o `load` (o import dinâmico do medidor) com ?fps. */
export function maybeStartFpsMeter(search: string, load: () => unknown): void {
  if (fpsEnabled(search)) load();
}
