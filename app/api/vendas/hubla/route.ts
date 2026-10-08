// Webhook da Hubla para o módulo Vendas.
// 1. confere o cabeçalho x-hubla-token com HUBLA_WEBHOOK_TOKEN (diferente → 401);
// 2. GRAVA o evento bruto em hubla_eventos (falhou → 500, e a Hubla tenta de novo);
// 3. responde 200 na hora e processa depois (modulos/vendas/processar.ts).
// Se o processamento falhar, o evento fica com erro e o admin reprocessa pela tela.

import { segredoConfere } from "@/lib/auth/segredo";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerFatura } from "@/modulos/vendas/hubla";
import { processarEvento } from "@/modulos/vendas/processar";
import { after } from "next/server";

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
  const { data: evento, error } = await db
    .from("hubla_eventos")
    .insert({
      tipo: fatura?.tipoBruto ?? "json_invalido",
      id_fatura: fatura?.idFatura ?? null,
      payload: payload ?? { bruto: bruto.slice(0, 100_000) },
      erro: payload === null ? "JSON inválido" : null,
      processado: payload === null,
    })
    .select("id")
    .single();

  if (error || !evento) {
    console.error("[webhook hubla] não gravou o evento:", error?.message);
    return Response.json({ ok: false }, { status: 500 });
  }

  if (payload !== null) after(() => processarEvento(evento.id));
  return Response.json({ ok: true });
}
