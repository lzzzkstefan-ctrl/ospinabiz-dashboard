// Leitura e gravação das BMs e números monitorados (tabelas monitor_bms e
// monitor_numeros). Usa o cliente do usuário logado: o RLS do banco garante
// que só admin grava; aqui só traduzimos o resultado.

import { createClient } from "@/lib/supabase/server";
import { mensagemDoErro } from "./regras";

export type Numero = { id: number; telefone: string; apelido: string; ativo: boolean };
export type BmComNumeros = { id: number; nome: string; ativo: boolean; numeros: Numero[] };
export type Resultado = { erro?: string };

export async function listarBmsComNumeros(): Promise<BmComNumeros[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monitor_bms")
    .select("id, nome, ativo, numeros:monitor_numeros(id, telefone, apelido, ativo)")
    .order("nome");

  if (error) throw new Error(`Erro ao carregar as BMs: ${error.message}`);

  return (data as BmComNumeros[]).map((bm) => ({
    ...bm,
    numeros: [...bm.numeros].sort((a, b) => a.apelido.localeCompare(b.apelido, "pt-BR")),
  }));
}

export async function inserirBm(nome: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("monitor_bms").insert({ nome });
  return error ? { erro: mensagemDoErro(error.code, `A BM "${nome}"`) } : {};
}

export async function inserirNumero(dados: { bmId: number; telefone: string; apelido: string }): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("monitor_numeros")
    .insert({ bm_id: dados.bmId, telefone: dados.telefone, apelido: dados.apelido });
  return error ? { erro: mensagemDoErro(error.code, "Esse telefone") } : {};
}

export async function mudarAtivo(tabela: "monitor_bms" | "monitor_numeros", id: number, ativo: boolean): Promise<Resultado> {
  const supabase = await createClient();
  // .select() devolve as linhas alteradas: se o RLS bloquear, vem vazio (sem erro).
  const { data, error } = await supabase.from(tabela).update({ ativo }).eq("id", id).select("id");
  if (error) return { erro: mensagemDoErro(error.code, "Item") };
  if (!data?.length) return { erro: "Sem permissão ou item não encontrado." };
  return {};
}
