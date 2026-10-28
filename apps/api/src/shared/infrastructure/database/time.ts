/** Conversão entre os instantes do domínio (ms) e as colunas timestamptz (D42). */

export function toDate(ms: number): Date;
export function toDate(ms: number | null): Date | null;
export function toDate(ms: number | null): Date | null {
  return ms === null ? null : new Date(ms);
}

export function toMs(date: Date): number;
export function toMs(date: Date | null): number | null;
export function toMs(date: Date | null): number | null {
  return date === null ? null : date.getTime();
}
