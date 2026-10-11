// Leitura e gravação das tarefas (tabela tarefas) e das opções dos formulários
// (equipe, BMs e números). Usa o cliente do usuário logado; o RLS do banco
// garante que só quem está logado lê e grava, e que ninguém apaga.

import { createClient } from "@/lib/supabase/server";
import { mensagemDoErro, type CamposTarefa, type Pessoa, type StatusTarefa, type Tarefa } from "./regras";

export type Resultado = { erro?: string };
export type OpcoesTarefa = {
  equipe: Pessoa[];
  bms: { id: number; nome: string; numeros: { id: number; final: string }[] }[];
};

type Equipe = { id: number; nome: string; apelido: string | null };
const pessoa = (e: Equipe): Pessoa => ({ id: Number(e.id), nome: e.apelido || e.nome });

export async function listarTarefas(): Promise<Tarefa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefas")
    .select(
      "id, titulo, descricao, status, prioridade, area, prazo, prazo_hora, ordem, criado_em, concluida_em, responsavel:equipe(id, nome, apelido), bm:monitor_bms(id, nome), numero:monitor_numeros(id, final, bm:monitor_bms(nome)), webinario:webinarios(id, nome)",
    )
    .order("ordem");
  if (error) throw new Error(`Erro ao carregar as tarefas: ${error.message}`);
  type Linha = Omit<Tarefa, "responsavel"> & { responsavel: Equipe | null };
  return (data as unknown as Linha[]).map((t) => ({ ...t, ordem: Number(t.ordem), responsavel: t.responsavel ? pessoa(t.responsavel) : null }));
}

/** Equipe ativa (sem a conta de teste) e BMs/números ativos, para os seletores. */
export async function listarOpcoes(): Promise<OpcoesTarefa> {
  const supabase = await createClient();
  const [equipe, bms] = await Promise.all([
    supabase.from("equipe").select("id, nome, apelido").eq("ativo", true).eq("teste", false).order("nome"),
    supabase
      .from("monitor_bms")
      .select("id, nome, numeros:monitor_numeros(id, final, ativo)")
      .eq("ativo", true)
      .order("nome"),
  ]);
  if (equipe.error) throw new Error(`Erro ao carregar a equipe: ${equipe.error.message}`);
  if (bms.error) throw new Error(`Erro ao carregar as BMs: ${bms.error.message}`);

  type BmBruta = { id: number; nome: string; numeros: { id: number; final: string; ativo: boolean }[] };
  return {
    equipe: (equipe.data as Equipe[]).map(pessoa),
    bms: (bms.data as BmBruta[]).map((bm) => ({
      id: bm.id,
      nome: bm.nome,
      numeros: bm.numeros
        .filter((n) => n.ativo)
        .map(({ id, final }) => ({ id, final }))
        .sort((a, b) => a.final.localeCompare(b.final)),
    })),
  };
}

/** Ordem para entrar no topo de uma coluna (menor que a do cartão de cima). */
export async function ordemNoTopo(status: StatusTarefa): Promise<number> {
  const supabase = await createClient();
  const { data: topo } = await supabase.from("tarefas").select("ordem").eq("status", status).order("ordem").limit(1).maybeSingle();
  return topo ? Number(topo.ordem) - 1000 : 1000;
}

/** Nova tarefa entra no topo de "A fazer". */
export async function inserirTarefa(campos: CamposTarefa): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("tarefas").insert({ ...campos, ordem: await ordemNoTopo("a_fazer") });
  return error ? { erro: mensagemDoErro(error) } : {};
}

export async function atualizarTarefa(
  id: number,
  dados: Partial<CamposTarefa & { status: StatusTarefa; ordem: number }>,
): Promise<Resultado> {
  const supabase = await createClient();
  // .select() devolve as linhas alteradas: se o RLS bloquear, vem vazio (sem erro).
  const { data, error } = await supabase.from("tarefas").update(dados).eq("id", id).select("id");
  if (error) return { erro: mensagemDoErro(error) };
  if (!data?.length) return { erro: "Tarefa não encontrada." };
  return {};
}
