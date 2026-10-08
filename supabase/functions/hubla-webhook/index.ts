// Webhook da Hubla (Edge Function do Supabase). Só RECEBE; a regra de venda fica no Next.
// 1. confere o cabeçalho x-hubla-token com o segredo HUBLA_WEBHOOK_TOKEN (diferente → 401);
// 2. grava o evento bruto em hubla_eventos com a chave x-hubla-idempotency. A mesma chave
//    de novo (a Hubla reenviando) bate na trava do banco e volta 200 sem gravar outra vez;
// 3. responde 200. Um gatilho no banco chama /api/vendas/processar na Vercel, que aplica
//    as regras (modulos/vendas/processar.ts). Se falhar, o pg_cron tenta de novo a cada 10 min.
// Sem JWT (verify_jwt = false): a Hubla não manda chave do Supabase, só o x-hubla-token.

import { createClient } from "@supabase/supabase-js";

// Compara pelo hash (tempo constante) e ignora espaço/Enter nas pontas, como lib/auth/segredo.ts.
async function segredoConfere(recebido: string | null, esperado: string | undefined): Promise<boolean> {
  const a = recebido?.trim();
  const b = esperado?.trim();
  if (!a || !b) return false;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [ha, hb] = await Promise.all([hash(a), hash(b)]);
  let dif = 0;
  for (let i = 0; i < ha.length; i++) dif |= ha[i] ^ hb[i];
  return dif === 0;
}

// Chave secreta do projeto: a nova (SUPABASE_SECRET_KEYS) ou a antiga (service_role).
function chaveSecreta(): string | undefined {
  try {
    const novas = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof novas.default === "string") return novas.default;
  } catch {
    // segue para a antiga
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ ok: false }, { status: 405 });
  if (!(await segredoConfere(req.headers.get("x-hubla-token"), Deno.env.get("HUBLA_WEBHOOK_TOKEN")))) {
    console.warn("[hubla-webhook] 401: token ausente, diferente ou HUBLA_WEBHOOK_TOKEN não configurado");
    return Response.json({ ok: false }, { status: 401 });
  }

  const bruto = await req.text();
  let payload: Record<string, unknown> | null = null;
  try {
    const p = JSON.parse(bruto);
    payload = p && typeof p === "object" ? p : null;
  } catch {
    payload = null;
  }
  const chave = req.headers.get("x-hubla-idempotency")?.trim() || null;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, chaveSecreta()!, { auth: { persistSession: false } });
  const { error } = await db.from("hubla_eventos").insert({
    tipo: payload ? (typeof payload.type === "string" ? payload.type : "desconhecido") : "json_invalido",
    payload: payload ?? { bruto: bruto.slice(0, 100_000) },
    erro: payload ? null : "JSON inválido",
    processado: !payload,
    chave_idempotencia: chave,
    origem: "edge",
  });

  if (error) {
    if (error.code === "23505") return Response.json({ ok: true, repetido: true });
    console.error("[hubla-webhook] não gravou o evento:", error.message);
    return Response.json({ ok: false }, { status: 500 }); // a Hubla tenta de novo
  }
  return Response.json({ ok: true });
});
