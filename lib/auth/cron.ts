import { createHash, timingSafeEqual } from "node:crypto";

// Confere se quem chamou é o pg_cron do Supabase: cabeçalho
// Authorization: Bearer <CRON_SECRET>. A senha é a mesma do Vault (cron_secret).
// Sem CRON_SECRET configurado, recusa sempre (nunca compara com vazio).
export function chamadaDoCron(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;

  const recebido = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo}`;

  // Compara os hashes em tempo constante: não revela pela demora quantos
  // caracteres batem, e os dois lados têm sempre o mesmo tamanho.
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
