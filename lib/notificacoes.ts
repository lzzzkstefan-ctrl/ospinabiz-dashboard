// Envio de push e registro do caminho até o aparelho, usados pelos avisos do Check-in, de Vendas e pelo
// /api/push/recebido. Quem recebe é o módulo que decide. O registro fica em notificacoes_enviadas (chave
// única por acontecimento: o mesmo aviso nunca sai duas vezes) e push_entregas (uma linha por aparelho).
// Roda no servidor com a chave secreta.

import { enviarPush, type Aviso } from "@/lib/integracoes/webpush";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

export type InscricaoAlvo = { id: number; usuario_id: string; endpoint: string; p256dh: string; auth: string; aparelho: string | null };

/**
 * Manda o aviso para esses aparelhos e anota o que o serviço de push respondeu. Cada aparelho recebe o id
 * da própria entrega dentro do aviso, para confirmar o recebimento. Devolve quantos foram aceitos.
 */
export async function entregarAviso(db: Db, avisoId: number, alvo: InscricaoAlvo[], aviso: Aviso): Promise<number> {
  const { data: linhas, error } = alvo.length
    ? await db
        .from("push_entregas")
        .insert(alvo.map((i) => ({ aviso_id: avisoId, usuario_id: i.usuario_id, inscricao_id: i.id, aparelho: i.aparelho })))
        .select("id, inscricao_id")
    : { data: [], error: null };
  // sem a linha da entrega o aviso sai igual, só não dá para confirmar o recebimento
  if (error) console.error("[push] entrega não registrada:", error.message);
  const entregaDe = new Map((linhas ?? []).map((l) => [Number(l.inscricao_id), String(l.id)]));

  const resultado: { aparelho: string | null; situacao: string; codigo?: number; detalhe?: string }[] = [];
  let enviados = 0;
  for (const i of alvo) {
    const entrega = entregaDe.get(Number(i.id));
    const r = await enviarPush({ endpoint: i.endpoint, p256dh: i.p256dh, auth: i.auth }, { ...aviso, entrega });
    resultado.push({ aparelho: i.aparelho ?? null, ...r });
    if (r.situacao === "ok") enviados++;
    if (r.situacao === "expirada") await db.from("push_inscricoes").delete().eq("id", i.id);
    if (entrega) await db.from("push_entregas").update({ situacao: r.situacao, codigo: r.codigo ?? null }).eq("id", entrega);
  }
  await db.from("notificacoes_enviadas").update({ enviados, resultado }).eq("id", avisoId);
  if (alvo.length) await db.from("push_inscricoes").update({ ultimo_envio: new Date().toISOString() }).in("id", alvo.map((i) => i.id));
  return enviados;
}

/** Aviso para pessoas escolhidas pelo módulo (ex.: venda e reembolso → só o vendedor dono). Devolve os aparelhos que aceitaram (0 se já avisado). */
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
    // venda e reembolso continuam valendo depois de horas: celular desligado à noite ainda recebe (24 h)
    return await entregarAviso(db, registro.id, inscricoes ?? [], { validadeS: 24 * 60 * 60, ...aviso, tag: `${tipo}:${chave}` });
  } catch (e) {
    await db.from("notificacoes_enviadas").update({ erro: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq("id", registro.id);
    throw e;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O aparelho confirmou o aviso. O id da entrega é aleatório e só o aparelho o recebeu: é ele que prova quem chamou. */
export async function registrarRecebimento(db: Db, entrega: unknown, versao: unknown): Promise<boolean> {
  if (typeof entrega !== "string" || !UUID.test(entrega)) return false;
  const agora = new Date().toISOString();
  const { data, error } = await db
    .from("push_entregas")
    .update({ recebido_em: agora, sw_versao: Number.isInteger(versao) ? versao : null })
    .eq("id", entrega)
    .is("recebido_em", null)
    .select("aviso_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) await db.from("notificacoes_enviadas").update({ recebido_em: agora }).eq("id", data.aviso_id).is("recebido_em", null);
  return true;
}

export type InscricaoRecebida = { endpoint: string; keys: { p256dh: string; auth: string } };

/**
 * Inscrição do aparelho no banco igual à do navegador, em nome de quem está logado: atualiza se mudou e
 * passa para esta pessoa se o navegador era de outra. Outra inscrição da pessoa no mesmo aparelho sai. Linha
 * antiga sem aparelho_id só dá para comparar pelo nome ("Safari · iPhone/iPad"): sai também e, se era outro
 * aparelho de verdade, ele volta ao abrir o app, já com o próprio id, e daí em diante os dois convivem.
 */
export async function guardarInscricao(db: Db, usuarioId: string, sub: InscricaoRecebida, aparelho: string, aparelhoId: string | null): Promise<{ mudou: boolean; erro?: string }> {
  const id = aparelhoId && /^[\w-]{8,64}$/.test(aparelhoId) ? aparelhoId : null;
  const agora = new Date().toISOString();
  const { data: atual } = await db.from("push_inscricoes").select("id, usuario_id, p256dh, auth, aparelho_id").eq("endpoint", sub.endpoint).maybeSingle();
  if (atual && atual.usuario_id === usuarioId && atual.p256dh === sub.keys.p256dh && atual.auth === sub.keys.auth && (!id || atual.aparelho_id === id)) {
    await db.from("push_inscricoes").update({ visto_em: agora }).eq("id", atual.id);
    return { mudou: false };
  }
  const nome = aparelho.slice(0, 200);
  const { error } = await db
    .from("push_inscricoes")
    .upsert({ usuario_id: usuarioId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, aparelho: nome, aparelho_id: id, visto_em: agora }, { onConflict: "endpoint" });
  if (error) return { mudou: false, erro: error.message };
  if (id) {
    const { error: e2 } = await db
      .from("push_inscricoes")
      .delete()
      .eq("usuario_id", usuarioId)
      .neq("endpoint", sub.endpoint)
      .or(`aparelho_id.eq.${id},and(aparelho_id.is.null,aparelho.eq."${nome.replace(/"/g, "")}")`);
    if (e2) console.error("[push] duplicada não removida:", e2.message);
  }
  return { mudou: true };
}
