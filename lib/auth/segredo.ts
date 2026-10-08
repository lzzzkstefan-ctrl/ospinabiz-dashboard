import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara um segredo recebido com o esperado, em tempo constante (a demora não
 * revela quantos caracteres batem). Ignora espaço/Enter nas pontas: token colado
 * na Vercel com Enter no fim é um erro comum. Sem segredo esperado, recusa sempre.
 */
export function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  const e = esperado?.trim();
  const r = recebido?.trim();
  if (!e || !r) return false;

  const a = createHash("sha256").update(r).digest();
  const b = createHash("sha256").update(e).digest();
  return timingSafeEqual(a, b);
}
