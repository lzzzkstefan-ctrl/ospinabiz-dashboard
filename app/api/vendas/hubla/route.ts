// Webhook da Hubla pela Vercel (alternativa à Edge Function supabase/functions/hubla-webhook,
// que é a cadastrada na Hubla). Faz o mesmo que ela:
// 1. confere o cabeçalho x-hubla-token com HUBLA_WEBHOOK_TOKEN (diferente → 401);
// 2. GRAVA o evento bruto em hubla_eventos com a chave x-hubla-idempotency (repetido → 200
//    sem gravar de novo; falhou → 500, e a Hubla tenta de novo);
// 3. responde 200. O gatilho do banco chama /api/vendas/processar (modulos/vendas/processar.ts).
// Se o processamento falhar, o pg_cron tenta de novo e o admin reprocessa pela tela.

import { segredoConfere } from "@/lib/auth/segredo";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerFatura } from "@/modulos/vendas/hubla";

export async function POST(request: Request) {
  if (!segredoConfere(request.headers.get("x-hubla-token"), process.env.HUBLA_WEBHOOK_TOKEN)) {
    console.warn("[webhook hubla] 401: token ausente, diferente ou HUBLA_WEBHOOK_TOKEN não configurado");
    return Response.json({ ok: false }, { status: 401 });
  }

  const bruto = await request.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(bruto);
  } catch {
    payload = null;
  }
  const fatura = payload === null ? null : lerFatura(payload);

  const db = createAdminClient();
  const { error } = await db.from("hubla_eventos").insert({
    tipo: fatura?.tipoBruto ?? "json_invalido",
    id_fatura: fatura?.idFatura ?? null,
    payload: payload ?? { bruto: bruto.slice(0, 100_000) },
    erro: payload === null ? "JSON inválido" : null,
    processado: payload === null,
    chave_idempotencia: request.headers.get("x-hubla-idempotency")?.trim() || null,
  });

  if (error) {
    if (error.code === "23505") return Response.json({ ok: true, repetido: true });
    console.error("[webhook hubla] não gravou o evento:", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true });
}
