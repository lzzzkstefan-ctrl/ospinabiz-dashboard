// Processa eventos da Hubla já gravados em hubla_eventos (modulos/vendas/processar.ts).
// Quem chama: o gatilho do banco (com { id }, logo depois de gravar) e o pg_cron a cada
// 10 minutos (sem id: pega os pendentes). Autorização: Bearer CRON_SECRET.

import { chamadaDoCron } from "@/lib/auth/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { processarEvento } from "@/modulos/vendas/processar";

const MAX_TENTATIVAS = 5;

export async function POST(request: Request) {
  if (!chamadaDoCron(request)) return Response.json({ ok: false }, { status: 401 });

  const corpo = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof corpo.id === "number") {
    await processarEvento(corpo.id);
    return Response.json({ ok: true, processados: 1 });
  }

  // Pendentes: não processados, com menos de 5 tentativas e com mais de 2 minutos
  // (os recém-chegados o gatilho já está processando).
  const db = createAdminClient();
  const { data, error } = await db
    .from("hubla_eventos")
    .select("id")
    .eq("processado", false)
    .lt("tentativas", MAX_TENTATIVAS)
    .lt("recebido_em", new Date(Date.now() - 2 * 60_000).toISOString())
    .order("recebido_em")
    .limit(20);
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });

  for (const e of data) await processarEvento(e.id);
  return Response.json({ ok: true, processados: data.length });
}
