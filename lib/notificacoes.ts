// Aviso push para pessoas escolhidas pelo módulo (ex.: reembolso → admins, chefes e o vendedor).
// Mesmo registro do Check-in (notificacoes_enviadas, chave única por acontecimento: o mesmo aviso
// nunca sai duas vezes) e mesmas inscrições (push_inscricoes). Quem recebe é o módulo que decide;
// aqui só registra, manda e anota o resultado. Roda no servidor com a chave secreta.

import { enviarPush, type Aviso } from "@/lib/integracoes/webpush";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

/** Manda para todos os aparelhos dessas pessoas. Devolve quantos aparelhos receberam (0 se já avisado). */
export async function avisarPessoas(db: Db, tipo: string, chave: string, aviso: Aviso, usuarioIds: string[]): Promise<number> {
  const { data: registro } = await db
    .from("notificacoes_enviadas")
    .upsert({ tipo, chave, titulo: aviso.titulo, corpo: aviso.corpo }, { onConflict: "tipo,chave", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (!registro) return 0; // já avisado antes (mesmo acontecimento)

  try {
    const ids = [...new Set(usuarioIds)];
    const { data: inscricoes, error } = ids.length
      ? await db.from("push_inscricoes").select("id, usuario_id, endpoint, p256dh, auth, aparelho").in("usuario_id", ids)
      : { data: [], error: null };
    if (error) throw new Error(error.message);

    const comTag: Aviso = { ...aviso, tag: `${tipo}:${chave}` };
    const resultado: { aparelho: string | null; situacao: string; codigo?: number; detalhe?: string }[] = [];
    let enviados = 0;
    for (const i of inscricoes ?? []) {
      const r = await enviarPush({ endpoint: i.endpoint, p256dh: i.p256dh, auth: i.auth }, comTag);
      resultado.push({ aparelho: i.aparelho ?? null, ...r });
      if (r.situacao === "ok") enviados++;
      if (r.situacao === "expirada") await db.from("push_inscricoes").delete().eq("id", i.id);
    }
    await db.from("notificacoes_enviadas").update({ enviados, resultado }).eq("id", registro.id);
    if (inscricoes?.length) await db.from("push_inscricoes").update({ ultimo_envio: new Date().toISOString() }).in("id", inscricoes.map((i) => i.id));
    return enviados;
  } catch (e) {
    await db.from("notificacoes_enviadas").update({ erro: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq("id", registro.id);
    throw e;
  }
}
