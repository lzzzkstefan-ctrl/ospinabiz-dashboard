// Leitura e gravação das tarefas (tabela tarefas) e das opções dos formulários
// (equipe, BMs e números). Usa o cliente do usuário logado; o RLS do banco
// garante que só quem está logado lê e grava, e que ninguém apaga.

import { createClient } from "@/lib/supabase/server";
import { mensagemDoErro, type CamposTarefa, type StatusTarefa, type Tarefa } from "./regras";

export type Resultado = { erro?: string };
export type OpcoesTarefa = {
  equipe: { id: number; nome: string }[];
  bms: { id: number; nome: string; numeros: { id: number; final: string }[] }[];
};

export async function listarTarefas(): Promise<Tarefa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefas")
    .select(
      "id, titulo, prazo, status, criado_em, concluida_em, responsavel:equipe(id, nome), bm:monitor_bms(id, nome), numero:monitor_numeros(id, final, bm:monitor_bms(nome))",
    );
  if (error) throw new Error(`Erro ao carregar as tarefas: ${error.message}`);
  return data as unknown as Tarefa[];
}

/** Equipe ativa e BMs/números ativos, para os selects do formulário. */
export async function listarOpcoes(): Promise<OpcoesTarefa> {
  const supabase = await createClient();
  const [equipe, bms] = await Promise.all([
    supabase.from("equipe").select("id, nome").eq("ativo", true).order("nome"),
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
    equipe: equipe.data,
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

export async function inserirTarefa(campos: CamposTarefa): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("tarefas").insert(campos);
  return error ? { erro: mensagemDoErro(error) } : {};
}

export async function atualizarTarefa(id: number, dados: Partial<CamposTarefa & { status: StatusTarefa }>): Promise<Resultado> {
  const supabase = await createClient();
  // .select() devolve as linhas alteradas: se o RLS bloquear, vem vazio (sem erro).
  const { data, error } = await supabase.from("tarefas").update(dados).eq("id", id).select("id");
  if (error) return { erro: mensagemDoErro(error) };
  if (!data?.length) return { erro: "Tarefa não encontrada." };
  return {};
}
