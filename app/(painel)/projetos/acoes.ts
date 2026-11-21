"use server";

// Ações de Projetos (fase 2): iniciativas no kanban, checklist, links e comentários.

import type { EstadoForm } from "@/components/formulario";
import { dbDaGestao, falhou, SO_GESTAO } from "@/lib/gestao-acao";
import { diaDoForm, ehColuna, idDoForm, ordemEntre, texto, urlOk } from "@/modulos/gestao/regras";
import { refresh } from "next/cache";

async function feito(e: EstadoForm | null, ok = "Salvo."): Promise<EstadoForm> {
  if (e) return e;
  refresh();
  return { ok };
}

/** Nova iniciativa: entra no topo da coluna escolhida (padrão Ideia). */
export async function criarIniciativa(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const titulo = texto(form, "titulo", 160);
  if (!titulo) return { erro: "Dê um título." };
  const colunaForm = form.get("coluna");
  const coluna = ehColuna(colunaForm) ? colunaForm : "ideia";
  const { data: topo } = await g.db.from("iniciativas").select("ordem").eq("coluna", coluna).order("ordem").limit(1).maybeSingle();
  const { error } = await g.db.from("iniciativas").insert({
    titulo,
    coluna,
    frente_id: idDoForm(form, "frente_id"),
    dono_id: idDoForm(form, "dono_id"),
    ordem: ordemEntre(undefined, topo ? Number(topo.ordem) : undefined),
  });
  return feito(falhou(error), "Criada.");
}

/** Editar título, frente, objetivo, dono e prazo. */
export async function salvarIniciativa(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idDoForm(form, "id");
  const titulo = texto(form, "titulo", 160);
  if (!id) return { erro: "Projeto não encontrado." };
  if (!titulo) return { erro: "Dê um título." };
  const { error } = await g.db
    .from("iniciativas")
    .update({ titulo, frente_id: idDoForm(form, "frente_id"), objetivo: texto(form, "objetivo", 300), dono_id: idDoForm(form, "dono_id"), prazo: diaDoForm(form, "prazo") })
    .eq("id", id);
  return feito(falhou(error));
}

/** Arrastar no kanban: coluna e posição numa gravação só. */
export async function moverIniciativa(id: number, coluna: string, ordem: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  if (!ehColuna(coluna) || !Number.isFinite(ordem)) return { erro: "Movimento inválido." };
  const { error } = await g.db.from("iniciativas").update({ coluna, ordem }).eq("id", id);
  return feito(falhou(error, "Não deu para mover."), "Movida.");
}

export async function apagarIniciativa(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("iniciativas").delete().eq("id", id);
  return feito(falhou(error, "Não deu para apagar."), "Apagada.");
}

// ---------- checklist ----------
export async function criarItem(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const iniciativaId = idDoForm(form, "iniciativa_id");
  const textoItem = texto(form, "texto", 300);
  if (!iniciativaId) return { erro: "Projeto não encontrado." };
  if (!textoItem) return { erro: "Escreva o item." };
  const { data: ultimo } = await g.db.from("iniciativa_itens").select("ordem").eq("iniciativa_id", iniciativaId).order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { error } = await g.db.from("iniciativa_itens").insert({
    iniciativa_id: iniciativaId,
    texto: textoItem,
    responsavel_id: idDoForm(form, "responsavel_id"),
    prazo: diaDoForm(form, "prazo"),
    ordem: (ultimo ? Number(ultimo.ordem) : 0) + 1,
  });
  return feito(falhou(error), "Item criado.");
}

export async function alternarItem(id: number, feito_: boolean): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("iniciativa_itens").update({ feito_em: feito_ ? new Date().toISOString() : null }).eq("id", id);
  return feito(falhou(error));
}

/** Trocar responsável ou prazo de um item. */
export async function ajustarItem(id: number, campos: { responsavel_id?: number | null; prazo?: string | null }): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const mudar: { responsavel_id?: number | null; prazo?: string | null } = {};
  if ("responsavel_id" in campos) mudar.responsavel_id = Number.isInteger(campos.responsavel_id) ? campos.responsavel_id : null;
  if ("prazo" in campos) mudar.prazo = campos.prazo && /^\d{4}-\d{2}-\d{2}$/.test(campos.prazo) ? campos.prazo : null;
  const { error } = await g.db.from("iniciativa_itens").update(mudar).eq("id", id);
  return feito(falhou(error));
}

export async function apagarItem(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("iniciativa_itens").delete().eq("id", id);
  return feito(falhou(error, "Não deu para apagar."), "Apagado.");
}

// ---------- links ----------
export async function criarLink(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const iniciativaId = idDoForm(form, "iniciativa_id");
  const url = texto(form, "url", 2000);
  if (!iniciativaId) return { erro: "Projeto não encontrado." };
  if (!urlOk(url)) return { erro: "O link precisa começar com http:// ou https://." };
  const titulo = texto(form, "titulo", 120) ?? new URL(url).hostname.replace(/^www\./, "");
  const { error } = await g.db.from("iniciativa_links").insert({ iniciativa_id: iniciativaId, titulo, url });
  return feito(falhou(error), "Link salvo.");
}

export async function apagarLink(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("iniciativa_links").delete().eq("id", id);
  return feito(falhou(error, "Não deu para apagar."), "Apagado.");
}

// ---------- comentários ----------
export async function comentar(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const iniciativaId = idDoForm(form, "iniciativa_id");
  const textoCom = texto(form, "texto", 4000);
  if (!iniciativaId) return { erro: "Projeto não encontrado." };
  if (!textoCom) return { erro: "Escreva o comentário." };
  const { error } = await g.db.from("iniciativa_comentarios").insert({ iniciativa_id: iniciativaId, texto: textoCom, autor_id: g.usuario.id });
  return feito(falhou(error), "Comentado.");
}

/** Só o autor apaga (o banco confere). */
export async function apagarComentario(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { data, error } = await g.db.from("iniciativa_comentarios").delete().eq("id", id).select("id");
  if (!error && !data?.length) return { erro: "Só quem escreveu pode apagar." };
  return feito(falhou(error, "Não deu para apagar."), "Apagado.");
}
