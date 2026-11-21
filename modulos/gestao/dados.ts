// Leitura da central de gestão (fase 2): Hoje, Projetos e Decisões. Lê com o login de quem abriu
// (o RLS só libera para a gestão). Contexto em docs/modulos/gestao.md.

import { createClient } from "@/lib/supabase/server";
import { segundaDa, somarDias, somarVendas, type Coluna, type Investimento, type Numeros, type StatusDecisao, type StatusFrente } from "./regras";

export type Pessoa = { id: number; nome: string };
export type Frente = { id: number; slug: string; nome: string; status: StatusFrente };

function erro(onde: string, e: { message: string } | null): void {
  if (e) throw new Error(`Erro ao carregar ${onde}: ${e.message}`);
}

/** Pessoas ativas da equipe (sem o usuário de teste), para dono e responsável. */
export async function listarPessoas(): Promise<Pessoa[]> {
  const db = await createClient();
  const { data, error } = await db.from("equipe").select("id, nome, ativo, teste").order("nome");
  erro("a equipe", error);
  return (data ?? []).filter((p) => p.ativo && !p.teste).map((p) => ({ id: Number(p.id), nome: String(p.nome) }));
}

export async function listarFrentes(): Promise<Frente[]> {
  const db = await createClient();
  const { data, error } = await db.from("frentes").select("id, slug, nome, status").order("ordem");
  erro("as frentes", error);
  return (data ?? []).map((f) => ({ ...f, id: Number(f.id) }) as Frente);
}

// ---------------------------------------------------------------------------
// Hoje
// ---------------------------------------------------------------------------
export type Prioridade = { id: number; titulo: string; descricao: string | null; dono_id: number | null; prazo: string | null; concluida_em: string | null; ordem: number };

export async function prioridadesDaSemana(semana: string): Promise<Prioridade[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("prioridades")
    .select("id, titulo, descricao, dono_id, prazo, concluida_em, ordem")
    .eq("semana", semana)
    .order("ordem")
    .order("id");
  erro("as prioridades", error);
  return (data ?? []).map((p) => ({ ...p, id: Number(p.id), dono_id: p.dono_id == null ? null : Number(p.dono_id) }));
}

export type NumerosSemana = Investimento & { origem: "manual" | "prime"; atualizado_em: string | null };

export async function numerosDaSemana(semana: string): Promise<NumerosSemana> {
  const db = await createClient();
  const { data, error } = await db.from("numeros_semana").select("investimento, cpl, leads, origem, atualizado_em").eq("semana", semana).maybeSingle();
  erro("os números da semana", error);
  const n = (v: unknown) => (v == null ? null : Number(v));
  return { investimento: n(data?.investimento), cpl: n(data?.cpl), leads: n(data?.leads), origem: (data?.origem as "manual" | "prime") ?? "manual", atualizado_em: data?.atualizado_em ?? null };
}

/**
 * Vendas e faturamento líquido de hoje e da semana, da tabela de vendas atual. Conta só venda paga,
 * fora de teste e já confirmada. Líquido = o que a Hubla repassa da fatura (receita_liquida); sem ele
 * (venda manual), o líquido do Viral ou o do ticket.
 */
export async function vendasDaSemana(hoje: string): Promise<Numeros> {
  const segunda = segundaDa(hoje);
  const db = await createClient();
  const { data, error } = await db
    .from("vendas")
    .select("data, status, teste, aguardando_confirmacao, receita_liquida, viral_liquido, snap_liquido")
    .gte("data", segunda)
    .lte("data", hoje)
    .eq("status", "pago");
  erro("as vendas", error);
  const n = (v: unknown) => (v == null ? null : Number(v));
  const vendas = (data ?? [])
    .filter((v) => !v.teste && !v.aguardando_confirmacao)
    .map((v) => ({ data: String(v.data), liquido: n(v.receita_liquida) ?? n(v.viral_liquido) ?? n(v.snap_liquido) ?? 0 }));
  return somarVendas(vendas, hoje, segunda);
}

export type DecisaoResumo = { id: number; data: string; decisao: string; quem_id: number | null };

export async function decisoesPendentes(): Promise<DecisaoResumo[]> {
  const db = await createClient();
  const { data, error } = await db.from("decisoes").select("id, data, decisao, quem_id").eq("status", "pendente").order("data").order("id");
  erro("as decisões", error);
  return (data ?? []).map((d) => ({ ...d, id: Number(d.id), quem_id: d.quem_id == null ? null : Number(d.quem_id) }));
}

export type Prazo = { tipo: "iniciativa" | "item"; id: number; iniciativaId: number; titulo: string; deQue: string | null; prazo: string; quem_id: number | null };

/** O que vence de hoje até daqui a 7 dias (e o que já passou e não foi feito), de Projetos. */
export async function prazosDaSemana(hoje: string): Promise<Prazo[]> {
  const ate = somarDias(hoje, 7);
  const db = await createClient();
  const [ini, itens] = await Promise.all([
    db.from("iniciativas").select("id, titulo, prazo, dono_id, coluna").not("prazo", "is", null).lte("prazo", ate).in("coluna", ["ideia", "planejando", "andamento"]),
    db.from("iniciativa_itens").select("id, texto, prazo, responsavel_id, iniciativa:iniciativa_id(id, titulo)").not("prazo", "is", null).lte("prazo", ate).is("feito_em", null),
  ]);
  erro("os prazos", ini.error ?? itens.error);
  const lista: Prazo[] = [
    ...(ini.data ?? []).map((i) => ({ tipo: "iniciativa" as const, id: Number(i.id), iniciativaId: Number(i.id), titulo: i.titulo, deQue: null, prazo: i.prazo!, quem_id: i.dono_id == null ? null : Number(i.dono_id) })),
    ...(itens.data ?? []).map((i) => {
      const ini = i.iniciativa as unknown as { id: number; titulo: string } | null;
      return { tipo: "item" as const, id: Number(i.id), iniciativaId: Number(ini?.id), titulo: i.texto, deQue: ini?.titulo ?? null, prazo: i.prazo!, quem_id: i.responsavel_id == null ? null : Number(i.responsavel_id) };
    }),
  ];
  return lista.sort((a, b) => a.prazo.localeCompare(b.prazo));
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------
export type Item = { id: number; texto: string; responsavel_id: number | null; prazo: string | null; feito_em: string | null; ordem: number };
export type Link = { id: number; titulo: string; url: string };
export type Comentario = { id: number; texto: string; criado_em: string; autor: string; meu: boolean };
export type Iniciativa = {
  id: number;
  titulo: string;
  frente_id: number | null;
  objetivo: string | null;
  dono_id: number | null;
  prazo: string | null;
  coluna: Coluna;
  ordem: number;
  itens: Item[];
  links: Link[];
  comentarios: Comentario[];
};

export async function carregarIniciativas(usuarioId: string): Promise<Iniciativa[]> {
  const db = await createClient();
  const [ini, itens, links, coms, equipe] = await Promise.all([
    db.from("iniciativas").select("id, titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem").order("ordem"),
    db.from("iniciativa_itens").select("id, iniciativa_id, texto, responsavel_id, prazo, feito_em, ordem").order("ordem").order("id"),
    db.from("iniciativa_links").select("id, iniciativa_id, titulo, url").order("id"),
    db.from("iniciativa_comentarios").select("id, iniciativa_id, texto, criado_em, autor_id").order("criado_em"),
    db.from("equipe").select("nome, usuario_id"),
  ]);
  erro("os projetos", ini.error ?? itens.error ?? links.error ?? coms.error ?? equipe.error);
  const nomeDo = new Map((equipe.data ?? []).filter((p) => p.usuario_id).map((p) => [String(p.usuario_id), String(p.nome)]));
  const num = (v: unknown) => (v == null ? null : Number(v));
  return (ini.data ?? []).map((i) => {
    const id = Number(i.id);
    return {
      ...i,
      id,
      frente_id: num(i.frente_id),
      dono_id: num(i.dono_id),
      coluna: i.coluna as Coluna,
      ordem: Number(i.ordem),
      itens: (itens.data ?? []).filter((x) => Number(x.iniciativa_id) === id).map((x) => ({ id: Number(x.id), texto: x.texto, responsavel_id: num(x.responsavel_id), prazo: x.prazo, feito_em: x.feito_em, ordem: Number(x.ordem) })),
      links: (links.data ?? []).filter((x) => Number(x.iniciativa_id) === id).map((x) => ({ id: Number(x.id), titulo: x.titulo, url: x.url })),
      comentarios: (coms.data ?? [])
        .filter((x) => Number(x.iniciativa_id) === id)
        .map((x) => ({ id: Number(x.id), texto: x.texto, criado_em: x.criado_em, autor: (x.autor_id && nomeDo.get(String(x.autor_id))) || "alguém", meu: x.autor_id === usuarioId })),
    };
  });
}

// ---------------------------------------------------------------------------
// Decisões
// ---------------------------------------------------------------------------
export type Decisao = {
  id: number;
  data: string;
  decisao: string;
  porque: string | null;
  quem_id: number | null;
  frente_id: number | null;
  iniciativa_id: number | null;
  status: StatusDecisao;
};
export type ItemPauta = {
  id: number;
  assunto: string;
  detalhe: string | null;
  criado_em: string;
  autor: string;
  resolvido_em: string | null;
  virou: "decisao" | "tarefa" | "descartado" | null;
};

export async function carregarDecisoes(): Promise<{ decisoes: Decisao[]; pauta: ItemPauta[] }> {
  const db = await createClient();
  const [dec, pauta, equipe] = await Promise.all([
    db.from("decisoes").select("id, data, decisao, porque, quem_id, frente_id, iniciativa_id, status").order("data", { ascending: false }).order("id", { ascending: false }),
    // abertos + os resolvidos dos últimos 14 dias (para ver o que a reunião fez)
    db
      .from("pauta_itens")
      .select("id, assunto, detalhe, criado_em, criado_por, resolvido_em, virou")
      .or(`resolvido_em.is.null,resolvido_em.gte.${new Date(Date.now() - 14 * 86_400_000).toISOString()}`)
      .order("criado_em"),
    db.from("equipe").select("nome, usuario_id"),
  ]);
  erro("as decisões", dec.error ?? pauta.error ?? equipe.error);
  const nomeDo = new Map((equipe.data ?? []).filter((p) => p.usuario_id).map((p) => [String(p.usuario_id), String(p.nome)]));
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    decisoes: (dec.data ?? []).map((d) => ({ ...d, id: Number(d.id), quem_id: num(d.quem_id), frente_id: num(d.frente_id), iniciativa_id: num(d.iniciativa_id), status: d.status as StatusDecisao })),
    pauta: (pauta.data ?? []).map((p) => ({
      id: Number(p.id),
      assunto: p.assunto,
      detalhe: p.detalhe,
      criado_em: p.criado_em,
      autor: (p.criado_por && nomeDo.get(String(p.criado_por))) || "alguém",
      resolvido_em: p.resolvido_em,
      virou: p.virou as ItemPauta["virou"],
    })),
  };
}

/** Só o título de cada iniciativa (para ligar decisão e mandar item da pauta para um projeto). */
export async function listarIniciativasCurtas(): Promise<{ id: number; titulo: string; frente_id: number | null }[]> {
  const db = await createClient();
  const { data, error } = await db.from("iniciativas").select("id, titulo, frente_id").order("titulo");
  erro("as iniciativas", error);
  return (data ?? []).map((i) => ({ id: Number(i.id), titulo: i.titulo, frente_id: i.frente_id == null ? null : Number(i.frente_id) }));
}
