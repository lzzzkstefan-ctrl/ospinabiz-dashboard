import { segredoConfere } from "./segredo";

// Confere se quem chamou é o pg_cron do Supabase: cabeçalho
// Authorization: Bearer <CRON_SECRET>. A senha é a mesma do Vault (cron_secret).
// Sem CRON_SECRET configurado, recusa sempre (nunca compara com vazio).
export function chamadaDoCron(request: Request): boolean {
  const cabecalho = request.headers.get("authorization") ?? "";
  const recebido = cabecalho.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  return segredoConfere(recebido, process.env.CRON_SECRET);
}
