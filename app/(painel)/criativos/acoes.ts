"use server";

// Ações da aba Criativos: criar, editar, mudar status, "Virar criativo" (a partir do que a IA gerou),
// marcar venceu/perdeu (vira aprendizado que o agente lê) e apagar. A IA em si roda em
// app/api/criativos/gerar (precisa de mais tempo que uma ação comum).

import type { EstadoForm } from "@/components/formulario";
import { dbDaGestao, falhou, SO_GESTAO } from "@/lib/gestao-acao";
import { ehOrigem, ehStatus, idForm, linkOk, textoForm, type Origem, type Status } from "@/modulos/criativos/regras";
import { refresh } from "next/cache";

async function feito(e: EstadoForm | null, ok = "Salvo."): Promise<EstadoForm> {
  if (e) return e;
  refresh();
  return { ok };
}

const limpar = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** Salvar a edição de todos os campos de um criativo. */
export async function salvarCriativo(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idForm(form, "id");
  const titulo = textoForm(form, "titulo", 160);
  if (!id) return { erro: "Criativo não encontrado." };
  if (!titulo) return { erro: "Dá um título." };
  const duracao = idForm(form, "duracao_seg");
  if (duracao !== null && (duracao < 1 || duracao > 600)) return { erro: "Duração entre 1 e 600 segundos." };
  const link = textoForm(form, "referencia_link", 2000);
  if (!linkOk(link)) return { erro: "O link precisa começar com http:// ou https://." };
  const origem = form.get("origem");
  const { error } = await g.db
    .from("criativos")
    .update({
      titulo,
      origem: ehOrigem(origem) ? origem : "ideia_propria",
      angulo: textoForm(form, "angulo", 300),
      formato: textoForm(form, "formato", 300),
      duracao_seg: duracao,
      hook: textoForm(form, "hook", 1000),
      subhook: textoForm(form, "subhook", 1000),
      corpo: textoForm(form, "corpo", 20000),
      cta: textoForm(form, "cta", 1000),
      roteiro_completo: textoForm(form, "roteiro_completo", 30000),
      referencia_link: link,
      referencia_transcricao: textoForm(form, "referencia_transcricao", 30000),
      resultado_notas: textoForm(form, "resultado_notas", 4000),
      metricas: {
        custo_por_lead: textoForm(form, "m_custo_por_lead", 40),
        conversas: textoForm(form, "m_conversas", 40),
        vendas: textoForm(form, "m_vendas", 40),
      },
    })
    .eq("id", id);
  return feito(falhou(error));
}

export async function mudarStatus(id: number, status: string): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  if (!ehStatus(status)) return { erro: "Status inválido." };
  const { error } = await g.db.from("criativos").update({ status }).eq("id", id);
  return feito(falhou(error, "Não deu pra mudar o status."), "Status mudado.");
}

export type NovoCriativo = {
  titulo?: string;
  status?: Status;
  origem: Origem;
  pai_id?: number | null;
  angulo?: string | null;
  formato?: string | null;
  duracao_seg?: number | null;
  hook?: string | null;
  subhook?: string | null;
  corpo?: string | null;
  cta?: string | null;
  roteiro_completo?: string | null;
  referencia_link?: string | null;
  referencia_transcricao?: string | null;
};

/**
 * "Virar criativo": cria um criativo a partir do que a IA gerou (ideia, hook de variação, hook de
 * referência, versão orgânica, campeão separado). Variação/orgânico herdam o corpo do pai quando não vem.
 */
export async function virarCriativo(dados: NovoCriativo): Promise<EstadoForm & { id?: number }> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  if (!ehOrigem(dados.origem)) return { erro: "Origem inválida." };
  const paiId = Number.isInteger(dados.pai_id) ? (dados.pai_id as number) : null;
  let corpo = limpar(dados.corpo, 20000);
  let cta = limpar(dados.cta, 1000);
  if (paiId && (!corpo || !cta)) {
    const { data: pai } = await g.db.from("criativos").select("corpo, cta").eq("id", paiId).maybeSingle();
    if (!pai) return { erro: "O criativo de origem não existe mais." };
    corpo ??= pai.corpo;
    cta ??= pai.cta;
  }
  const hook = limpar(dados.hook, 1000);
  const titulo = limpar(dados.titulo, 160) ?? (hook ? hook.slice(0, 80) : null);
  if (!titulo) return { erro: "Falta um título." };
  const link = limpar(dados.referencia_link, 2000);
  const duracao = Number.isInteger(dados.duracao_seg) && dados.duracao_seg! >= 1 && dados.duracao_seg! <= 600 ? dados.duracao_seg : null;
  const { data, error } = await g.db
    .from("criativos")
    .insert({
      titulo,
      status: dados.status && ehStatus(dados.status) ? dados.status : "ideia",
      origem: dados.origem,
      pai_id: paiId,
      angulo: limpar(dados.angulo, 300),
      formato: limpar(dados.formato, 300),
      duracao_seg: duracao,
      hook,
      subhook: limpar(dados.subhook, 1000),
      corpo,
      cta,
      roteiro_completo: limpar(dados.roteiro_completo, 30000),
      referencia_link: linkOk(link) ? link : null,
      referencia_transcricao: limpar(dados.referencia_transcricao, 30000),
    })
    .select("id")
    .single();
  const e = falhou(error, "Não deu pra criar o criativo.");
  if (e) return e;
  refresh();
  if (!data) return { erro: "Não deu pra criar o criativo." };
  return { ok: "Criativo criado.", id: Number(data.id) };
}

/** Criativo novo em branco (só o título): abre a tela dele pra preencher. */
export async function criarEmBranco(_anterior: EstadoForm & { id?: number }, form: FormData): Promise<EstadoForm & { id?: number }> {
  const titulo = textoForm(form, "titulo", 160);
  if (!titulo) return { erro: "Dá um título." };
  return virarCriativo({ titulo, origem: "ideia_propria" });
}

/** Venceu/perdeu: muda o status e guarda o motivo na memória da operação (o agente lê os últimos 20). */
export async function marcarResultado(id: number, tipo: "venceu" | "perdeu", motivo: string): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  if (tipo !== "venceu" && tipo !== "perdeu") return { erro: "Resultado inválido." };
  const m = limpar(motivo, 500);
  if (!m) return { erro: "Escreve o motivo numa frase: é isso que a IA vai aprender." };
  const { error: e1 } = await g.db.from("criativo_aprendizados").insert({ criativo_id: id, tipo, motivo: m });
  if (e1) return falhou(e1)!;
  const { error } = await g.db.from("criativos").update({ status: tipo }).eq("id", id);
  return feito(falhou(error), tipo === "venceu" ? "Anotado: venceu." : "Anotado: perdeu.");
}

/** Usar o roteiro gerado no próprio criativo (preenche os campos e passa pra "Roteiro" se ainda era ideia). */
export async function aplicarRoteiro(
  id: number,
  r: { angulo: string; formato: string; duracao_seg: number; hook: string; subhook: string; roteiro: string; cta: string },
): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { data: atual } = await g.db.from("criativos").select("status").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Criativo não encontrado." };
  const duracao = Number.isInteger(r.duracao_seg) && r.duracao_seg >= 1 && r.duracao_seg <= 600 ? r.duracao_seg : null;
  const { error } = await g.db
    .from("criativos")
    .update({
      angulo: limpar(r.angulo, 300),
      formato: limpar(r.formato, 300),
      duracao_seg: duracao,
      hook: limpar(r.hook, 1000),
      subhook: limpar(r.subhook, 1000),
      roteiro_completo: limpar(r.roteiro, 30000),
      cta: limpar(r.cta, 1000),
      ...(atual.status === "ideia" ? { status: "roteiro" } : {}),
    })
    .eq("id", id);
  return feito(falhou(error), "Roteiro aplicado no criativo.");
}

/** Apaga o criativo (as variações ficam, soltas; o histórico de gasto fica). */
export async function apagarCriativo(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("criativos").delete().eq("id", id);
  return feito(falhou(error, "Não deu pra apagar."), "Apagado.");
}
