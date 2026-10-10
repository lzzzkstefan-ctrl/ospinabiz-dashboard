// Leitura dos Webinários, com o login de quem vê (RLS): o admin lê tudo; o vendedor não lê as
// tabelas de webinário — só a função webinarios_no_ar() (nome e playbook dos "no ar") e as
// tarefas do checklist (regras da aba Tarefas).

import { createClient } from "@/lib/supabase/server";
import type { Sessao, StatusWebinario, TipoWebinario } from "./regras";

export type Webinario = {
  id: number;
  nome: string;
  tipo: TipoWebinario;
  oferta: string | null;
  preco: number | null;
  frequencia: string | null;
  horario: string | null;
  plataforma: string | null;
  hubla_oferta_id: string | null;
  status: StatusWebinario;
};

export type TarefaChecklist = { id: number; titulo: string; status: "pendente" | "concluida"; prazo: string | null; responsavel: string | null; webinarioId: number };
export type LinkWebinario = { id: number; tipo: string; titulo: string; url: string };

const COLUNAS = "id, nome, tipo, oferta, preco, frequencia, horario, plataforma, hubla_oferta_id, status";

function normalizar(w: Record<string, unknown>): Webinario {
  return { ...(w as unknown as Webinario), preco: w.preco == null ? null : Number(w.preco) };
}

/** Tarefas do checklist de uns webinários (com o nome do responsável). */
async function tarefasDe(ids: number[]): Promise<TarefaChecklist[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefas")
    .select("id, titulo, status, prazo, webinario_id, equipe:responsavel_id(nome)")
    .in("webinario_id", ids)
    .order("id");
  if (error) throw new Error(`Erro ao carregar o checklist: ${error.message}`);
  type Linha = { id: number; titulo: string; status: "pendente" | "concluida"; prazo: string | null; webinario_id: number; equipe: { nome: string } | null };
  return (data as unknown as Linha[]).map((t) => ({ id: Number(t.id), titulo: t.titulo, status: t.status, prazo: t.prazo, responsavel: t.equipe?.nome ?? null, webinarioId: Number(t.webinario_id) }));
}

/** Admin: todos os webinários, com o progresso do checklist. */
export async function listarWebinarios(): Promise<(Webinario & { feitas: number; total: number })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("webinarios").select(COLUNAS).order("nome");
  if (error) throw new Error(`Erro ao carregar webinários: ${error.message}`);
  const ws = data.map(normalizar);
  const tarefas = await tarefasDe(ws.map((w) => w.id));
  return ws.map((w) => {
    const minhas = tarefas.filter((t) => t.webinarioId === w.id);
    return { ...w, total: minhas.length, feitas: minhas.filter((t) => t.status === "concluida").length };
  });
}

/** Admin: tudo de um webinário. */
export async function carregarWebinario(id: number) {
  const supabase = await createClient();
  const [w, sessoes, links, modelo, equipe, config] = await Promise.all([
    supabase.from("webinarios").select(COLUNAS).eq("id", id).maybeSingle(),
    supabase.from("webinario_sessoes").select("*").eq("webinario_id", id).order("dia", { ascending: false }),
    supabase.from("webinario_links").select("id, tipo, titulo, url").eq("webinario_id", id).order("tipo").order("titulo"),
    supabase.from("webinario_checklist_modelo").select("id, ordem, titulo, ativo").order("ordem"),
    supabase.from("equipe").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("webinarios_config").select("custo_mensagem").maybeSingle(),
  ]);
  if (w.error) throw new Error(`Erro ao carregar o webinário: ${w.error.message}`);
  if (!w.data) return null;
  return {
    webinario: normalizar(w.data),
    sessoes: (sessoes.data ?? []) as Sessao[],
    links: (links.data ?? []) as LinkWebinario[],
    tarefas: await tarefasDe([id]),
    modelo: (modelo.data ?? []).map((m) => ({ id: Number(m.id), titulo: String(m.titulo), ativo: !!m.ativo })),
    equipe: (equipe.data ?? []).map((p) => ({ id: Number(p.id), nome: String(p.nome) })),
    custoMensagem: Number(config.data?.custo_mensagem ?? 0.035),
  };
}

/** Vendedor (e admin): webinários "no ar", com o checklist e o playbook — nada além disso. */
export async function webinariosNoAr(): Promise<{ id: number; nome: string; playbooks: { titulo: string; url: string }[]; tarefas: TarefaChecklist[] }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("webinarios_no_ar");
  if (error) throw new Error(`Erro ao carregar webinários: ${error.message}`);
  const porId = new Map<number, { id: number; nome: string; playbooks: { titulo: string; url: string }[] }>();
  for (const r of data as { webinario_id: number; nome: string; playbook_titulo: string | null; playbook_url: string | null }[]) {
    const w = porId.get(Number(r.webinario_id)) ?? { id: Number(r.webinario_id), nome: r.nome, playbooks: [] };
    if (r.playbook_url) w.playbooks.push({ titulo: r.playbook_titulo ?? "Playbook", url: r.playbook_url });
    porId.set(w.id, w);
  }
  const tarefas = await tarefasDe([...porId.keys()]);
  return [...porId.values()].map((w) => ({ ...w, tarefas: tarefas.filter((t) => t.webinarioId === w.id) }));
}
