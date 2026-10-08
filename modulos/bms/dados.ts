// Leitura e gravação das BMs, números monitorados e equipe (tabelas monitor_bms,
// monitor_numeros e equipe). Usa o cliente do usuário logado: o RLS do banco
// garante que só admin grava; aqui só traduzimos o resultado.

import { createClient } from "@/lib/supabase/server";
import { mensagemDoErro, type Bm, type CamposNumero, type Pessoa } from "./regras";

export type Resultado = { erro?: string };

export async function listarBms(): Promise<Bm[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monitor_bms")
    .select(
      "id, nome, acesso_admin, ativo, numeros:monitor_numeros(id, bm_id, final, telefone, apelido, limite, situacao, ativo, responsavel:equipe(id, nome))",
    )
    .order("nome");

  if (error) throw new Error(`Erro ao carregar as BMs: ${error.message}`);

  return (data as unknown as Bm[]).map((bm) => ({
    ...bm,
    numeros: [...bm.numeros].sort((a, b) => a.final.localeCompare(b.final)),
  }));
}

export async function listarEquipe(): Promise<Pessoa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipe").select("id, nome").eq("ativo", true).order("nome");
  if (error) throw new Error(`Erro ao carregar a equipe: ${error.message}`);
  return data;
}

export async function inserirBm(dados: { nome: string; acesso_admin: boolean }): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("monitor_bms").insert(dados);
  return error ? { erro: mensagemDoErro(error) } : {};
}

export async function atualizarBm(
  id: number,
  dados: Partial<{ nome: string; acesso_admin: boolean; ativo: boolean }>,
): Promise<Resultado> {
  const supabase = await createClient();
  // .select() devolve as linhas alteradas: se o RLS bloquear, vem vazio (sem erro).
  const { data, error } = await supabase.from("monitor_bms").update(dados).eq("id", id).select("id");
  if (error) return { erro: mensagemDoErro(error) };
  if (!data?.length) return { erro: "Sem permissão ou BM não encontrada." };
  return {};
}

export async function inserirNumero(campos: CamposNumero): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("monitor_numeros").insert(campos);
  return error ? { erro: mensagemDoErro(error) } : {};
}

export async function atualizarNumero(id: number, dados: Partial<CamposNumero & { ativo: boolean }>): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("monitor_numeros").update(dados).eq("id", id).select("id");
  if (error) return { erro: mensagemDoErro(error) };
  if (!data?.length) return { erro: "Sem permissão ou número não encontrado." };
  return {};
}

/** Nome de uma BM pelo id (para montar o apelido padrão). */
export async function nomesDasBms(): Promise<Map<number, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("monitor_bms").select("id, nome");
  if (error) throw new Error(`Erro ao carregar as BMs: ${error.message}`);
  return new Map(data.map((bm) => [bm.id as number, bm.nome as string]));
}
