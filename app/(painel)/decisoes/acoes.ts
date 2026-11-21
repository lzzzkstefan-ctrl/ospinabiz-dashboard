"use server";

// Ações de Decisões (fase 2): registro de decisões e pauta da reunião semanal. Na reunião, cada item
// da pauta vira uma decisão, uma tarefa num projeto ou é descartado.

import type { EstadoForm } from "@/components/formulario";
import { dbDaGestao, falhou, SO_GESTAO } from "@/lib/gestao-acao";
import { diaDoForm, ehStatusDecisao, idDoForm, texto } from "@/modulos/gestao/regras";
import { refresh } from "next/cache";

function pronto(e: EstadoForm | null, ok = "Salvo."): EstadoForm {
  if (e) return e;
  refresh();
  return { ok };
}

/**
 * Cria (sem id) ou edita (com id) uma decisão. Com pauta_id, fecha o item da pauta como "virou decisão".
 */
export async function salvarDecisao(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idDoForm(form, "id");
  const decisao = texto(form, "decisao", 500);
  const statusForm = form.get("status");
  if (!decisao) return { erro: "Escreva a decisão." };
  if (!ehStatusDecisao(statusForm)) return { erro: "Escolha o status." };
  const campos = {
    decisao,
    porque: texto(form, "porque", 4000),
    quem_id: idDoForm(form, "quem_id"),
    frente_id: idDoForm(form, "frente_id"),
    iniciativa_id: idDoForm(form, "iniciativa_id"),
    status: statusForm,
    ...(diaDoForm(form, "data") ? { data: diaDoForm(form, "data")! } : {}),
  };

  if (id) {
    const { error } = await g.db.from("decisoes").update(campos).eq("id", id);
    return pronto(falhou(error));
  }
  const { data: nova, error } = await g.db.from("decisoes").insert(campos).select("id").single();
  const e = falhou(error);
  if (e || !nova) return e ?? { erro: "Não deu para salvar." };
  const pautaId = idDoForm(form, "pauta_id");
  if (pautaId) {
    const { error: e2 } = await g.db
      .from("pauta_itens")
      .update({ virou: "decisao", decisao_id: nova.id, resolvido_em: new Date().toISOString() })
      .eq("id", pautaId)
      .is("resolvido_em", null);
    if (e2) return falhou(e2, "A decisão foi salva, mas o item da pauta continuou aberto.")!;
  }
  return pronto(null, pautaId ? "Virou decisão." : "Registrada.");
}

export async function mudarStatusDecisao(id: number, status: string): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  if (!ehStatusDecisao(status)) return { erro: "Status inválido." };
  const { error } = await g.db.from("decisoes").update({ status }).eq("id", id);
  return pronto(falhou(error));
}

export async function apagarDecisao(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("decisoes").delete().eq("id", id);
  return pronto(falhou(error, "Não deu para apagar."), "Apagada.");
}

// ---------- pauta ----------
export async function adicionarPauta(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const assunto = texto(form, "assunto", 200);
  if (!assunto) return { erro: "Escreva o assunto." };
  const { error } = await g.db.from("pauta_itens").insert({ assunto, detalhe: texto(form, "detalhe", 2000), criado_por: g.usuario.id });
  return pronto(falhou(error), "Na pauta.");
}

/** Item da pauta vira um item de checklist num projeto. */
export async function pautaParaTarefa(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const pautaId = idDoForm(form, "pauta_id");
  const iniciativaId = idDoForm(form, "iniciativa_id");
  const textoItem = texto(form, "texto", 300);
  if (!pautaId) return { erro: "Item da pauta não encontrado." };
  if (!iniciativaId) return { erro: "Escolha o projeto." };
  if (!textoItem) return { erro: "Escreva a tarefa." };
  const { data: item, error } = await g.db
    .from("iniciativa_itens")
    .insert({ iniciativa_id: iniciativaId, texto: textoItem, responsavel_id: idDoForm(form, "responsavel_id"), prazo: diaDoForm(form, "prazo"), ordem: 9999 })
    .select("id")
    .single();
  const e = falhou(error);
  if (e || !item) return e ?? { erro: "Não deu para salvar." };
  const { error: e2 } = await g.db
    .from("pauta_itens")
    .update({ virou: "tarefa", iniciativa_item_id: item.id, resolvido_em: new Date().toISOString() })
    .eq("id", pautaId)
    .is("resolvido_em", null);
  if (e2) return falhou(e2, "A tarefa foi criada, mas o item da pauta continuou aberto.")!;
  return pronto(null, "Virou tarefa.");
}

export async function descartarPauta(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("pauta_itens").update({ virou: "descartado", resolvido_em: new Date().toISOString() }).eq("id", id).is("resolvido_em", null);
  return pronto(falhou(error), "Descartado.");
}

/** Volta para a pauta (some a ligação com a decisão ou tarefa, que continuam existindo). */
export async function reabrirPauta(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("pauta_itens").update({ virou: null, resolvido_em: null, decisao_id: null, iniciativa_item_id: null }).eq("id", id);
  return pronto(falhou(error), "De volta à pauta.");
}

export async function apagarPauta(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("pauta_itens").delete().eq("id", id);
  return pronto(falhou(error, "Não deu para apagar."), "Apagado.");
}
