"use server";

// Ações de Funis (fase 3): blocos (criar, editar, mover, apagar), ligações e link do Figma. Mover não
// chama refresh: a tela já está no estado certo.

import type { EstadoForm } from "@/components/formulario";
import { dbDaGestao, falhou, SO_GESTAO } from "@/lib/gestao-acao";
import { ehStatusBloco, ehTipoBloco, figmaOk, idDoForm, lerLinks, numeroDoForm, texto, type StatusBloco, type TipoBloco } from "@/modulos/gestao/regras";
import { refresh } from "next/cache";

function pronto(e: EstadoForm | null, ok = "Salvo."): EstadoForm {
  if (e) return e;
  refresh();
  return { ok };
}

const coord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/** Painel lateral: nome, tipo, status, preço, número da etapa, nota (gancho), links e o funil que abre. */
export async function salvarBloco(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idDoForm(form, "id");
  const nome = texto(form, "nome", 80);
  const tipo = form.get("tipo");
  const status = form.get("status");
  if (!id) return { erro: "Bloco não encontrado." };
  if (!nome) return { erro: "Dê um nome ao bloco." };
  if (!ehTipoBloco(tipo) || !ehStatusBloco(status)) return { erro: "Escolha tipo e status." };
  const preco = numeroDoForm(form, "preco");
  const ate = numeroDoForm(form, "preco_ate");
  if (ate != null && (preco == null || ate < preco)) return { erro: "O \"até\" precisa ser maior que o preço." };
  const numero = numeroDoForm(form, "numero");
  const { error } = await g.db
    .from("mapa_blocos")
    .update({
      nome,
      tipo,
      status,
      preco,
      preco_ate: ate,
      numero: numero == null ? null : Math.round(numero),
      nota: texto(form, "nota", 4000),
      links: lerLinks(String(form.get("links") ?? "")),
      abre_mapa_id: idDoForm(form, "abre_mapa_id"),
    })
    .eq("id", id);
  return pronto(falhou(error));
}

/** Novo bloco no ponto escolhido do canvas. */
export async function criarBloco(mapaId: number, tipo: string, x: number, y: number): Promise<EstadoForm & { id?: number }> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const t: TipoBloco = ehTipoBloco(tipo) ? tipo : "mensagem";
  const status: StatusBloco = "ideia";
  const { data, error } = await g.db
    .from("mapa_blocos")
    .insert({ mapa_id: mapaId, nome: "Novo bloco", tipo: t, status, pos_x: coord(x) ?? 0, pos_y: coord(y) ?? 0 })
    .select("id")
    .single();
  const e = falhou(error);
  if (e || !data) return e ?? { erro: "Não deu para criar." };
  refresh();
  return { ok: "Criado.", id: Number(data.id) };
}

/** Posições depois de arrastar (vários de uma vez). */
export async function moverBlocos(posicoes: { id: number; x: number; y: number }[]): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const validas = (Array.isArray(posicoes) ? posicoes : []).slice(0, 200).filter((p) => Number.isInteger(p?.id) && coord(p.x) != null && coord(p.y) != null);
  const erros = await Promise.all(validas.map((p) => g.db.from("mapa_blocos").update({ pos_x: coord(p.x), pos_y: coord(p.y) }).eq("id", p.id)));
  const e = erros.find((r) => r.error)?.error ?? null;
  return falhou(e, "Não deu para salvar a posição.") ?? { ok: "Posição salva." };
}

export async function apagarBloco(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("mapa_blocos").delete().eq("id", id);
  return pronto(falhou(error, "Não deu para apagar."), "Apagado.");
}

/** Seta de um bloco para outro (o banco só aceita blocos do mesmo funil e não repete a mesma seta). */
export async function ligarBlocos(mapaId: number, de: number, para: number): Promise<EstadoForm & { id?: number }> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  if (de === para) return { erro: "Ligue a outro bloco." };
  const { data, error } = await g.db.from("mapa_ligacoes").insert({ mapa_id: mapaId, de_bloco_id: de, para_bloco_id: para }).select("id").single();
  if (error?.code === "23505") return { erro: "Essa seta já existe." };
  const e = falhou(error, "Não deu para ligar.");
  if (e || !data) return e ?? { erro: "Não deu para ligar." };
  refresh();
  return { ok: "Ligado.", id: Number(data.id) };
}

export async function rotularLigacao(id: number, rotulo: string): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const r = String(rotulo ?? "").trim().slice(0, 60) || null;
  const { error } = await g.db.from("mapa_ligacoes").update({ rotulo: r }).eq("id", id);
  return pronto(falhou(error));
}

export async function apagarLigacao(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("mapa_ligacoes").delete().eq("id", id);
  return pronto(falhou(error, "Não deu para apagar."), "Apagada.");
}

export async function salvarFigma(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idDoForm(form, "mapa_id");
  const url = texto(form, "figma_url", 2000);
  if (!id) return { erro: "Funil não encontrado." };
  if (url && !figmaOk(url)) return { erro: "Use um link do figma.com (arquivo de design ou FigJam)." };
  const { error } = await g.db.from("mapas").update({ figma_url: url }).eq("id", id);
  return pronto(falhou(error), url ? "Link do Figma salvo." : "Link do Figma tirado.");
}
