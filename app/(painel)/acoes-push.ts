"use server";

// Notificações push do aparelho (cada um mexe só nas próprias). Saíram do Check-in (arquivado em
// 21/11/2026) porque o aviso de venda continua: usadas pelo vigia (aviso-notificacoes.tsx) e por
// Configurações → Notificações.

import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { guardarInscricao } from "@/lib/notificacoes";
import type { InscricaoNavegador } from "@/lib/push-navegador";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { avisoDeTeste } from "@/modulos/escala/alertas";
import { refresh } from "next/cache";

/**
 * O aparelho abriu o app com uma inscrição: garante que ela está no banco (se foi apagada, por
 * expirar ou por engano, volta). Sem refresh: roda em segundo plano a cada abertura.
 */
export async function confirmarInscricao(sub: InscricaoNavegador, aparelho: string, aparelhoId: string | null): Promise<{ voltou: boolean }> {
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) return { voltou: false };
  const usuario = await usuarioLogado();
  if (!usuario) return { voltou: false };
  const r = await guardarInscricao(createAdminClient(), usuario.id, sub, aparelho, aparelhoId);
  return { voltou: r.mudou };
}

/** Aparelho ativou as notificações: guarda a inscrição (troca se já existia). */
export async function salvarInscricao(sub: InscricaoNavegador, aparelho: string, aparelhoId: string | null): Promise<EstadoForm> {
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) return { erro: "Inscrição inválida." };
  const usuario = await usuarioLogado();
  if (!usuario) return { erro: "Entre de novo." };
  const r = await guardarInscricao(createAdminClient(), usuario.id, sub, aparelho, aparelhoId);
  if (r.erro) return { erro: "Não deu para ativar." };
  refresh();
  return { ok: "Notificações ativadas neste aparelho." };
}

export async function apagarInscricao(endpoint: string): Promise<EstadoForm> {
  const supabase = await createClient();
  await supabase.from("push_inscricoes").delete().eq("endpoint", endpoint);
  refresh();
  return { ok: "Notificações desligadas neste aparelho." };
}

/** Manda um aviso de teste só para os aparelhos de quem clicou. */
export async function testarNotificacao(): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (!usuario) return { erro: "Entre de novo." };
  const n = await avisoDeTeste(usuario.id);
  return n ? { ok: `Teste enviado (${n} aparelho${n > 1 ? "s" : ""}).` } : { erro: "Nenhum aparelho seu ativado (ou as chaves de notificação faltam no servidor)." };
}
