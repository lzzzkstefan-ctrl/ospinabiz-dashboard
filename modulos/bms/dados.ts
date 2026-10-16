// Leitura e gravação das BMs, números monitorados e equipe (tabelas monitor_bms,
// monitor_numeros e equipe). Usa o cliente do usuário logado: o RLS do banco
// garante que só admin grava; aqui só traduzimos o resultado.

import { createClient } from "@/lib/supabase/server";
import { hojeBrasilia, mensagemDoErro, type Bm, type CamposNumero, type Pessoa } from "./regras";

export type Resultado = { erro?: string };

export async function listarBms(): Promise<Bm[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monitor_bms")
    .select(
      "id, nome, acesso_admin, ativo, banida_em, ban_motivo, numeros:monitor_numeros(id, bm_id, final, telefone, apelido, limite, situacao, banido_em, ativo, responsavel:equipe(id, nome))",
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

/** Bane a BM (e todos os números dela, com a mesma data). A função do banco confere se é admin. */
export async function banirBm(id: number, data: string, motivo: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("bm_banir", { p_bm_id: id, p_data: data, p_motivo: motivo });
  return error ? { erro: error.message } : {};
}

/** Desfaz o ban: a BM e os números que ela baniu voltam para a situação de antes. */
export async function desfazerBanBm(id: number): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("bm_desfazer_ban", { p_bm_id: id });
  return error ? { erro: error.message } : {};
}

export type TotaisNumero = { leads: number; vendas: number };

/**
 * Leads e vendas que cada número (do monitor) gerou, para a seção "Levou ban". Mesma conta do Funil:
 * cada lead no número da primeira conversa; venda = lead que comprou (Hubla ou Pix/CNPJ). O RLS mostra
 * ao vendedor só os leads dele.
 */
export async function totaisDosNumeros(ids: number[]): Promise<Map<number, TotaisNumero>> {
  const totais = new Map<number, TotaisNumero>(ids.map((id) => [id, { leads: 0, vendas: 0 }]));
  if (!ids.length) return totais;
  const supabase = await createClient();
  const { data: ligados, error } = await supabase.from("funil_numeros").select("dc_id, monitor_numero_id").in("monitor_numero_id", ids);
  if (error) throw new Error(`Erro ao carregar os números da Data Crazy: ${error.message}`);
  const doMonitor = new Map((ligados ?? []).map((n) => [String(n.dc_id), Number(n.monitor_numero_id)]));
  if (!doMonitor.size) return totais;
  for (let de = 0; ; de += 1000) {
    const { data, error: e } = await supabase
      .from("funil_leads")
      .select("numero_dc_id, compra")
      .in("numero_dc_id", [...doMonitor.keys()])
      .eq("interno", false)
      .order("dc_id")
      .range(de, de + 999);
    if (e) throw new Error(`Erro ao contar os leads: ${e.message}`);
    for (const l of data) {
      const t = totais.get(doMonitor.get(String(l.numero_dc_id))!);
      if (!t) continue;
      t.leads++;
      if (l.compra === "hubla" || l.compra === "fora_hubla") t.vendas++;
    }
    if (data.length < 1000) break;
  }
  return totais;
}

export type TrafegoNumero = { hoje: number; semana: number };

/**
 * Leads que cada número ativo recebeu hoje e nos últimos 7 dias (hoje incluso, dia de Brasília), para ver
 * qual número concentra o tráfego. Lead conta no número da primeira conversa (mesma conta do Funil).
 */
export async function trafegoDosNumeros(ids: number[]): Promise<Map<number, TrafegoNumero>> {
  const trafego = new Map<number, TrafegoNumero>(ids.map((id) => [id, { hoje: 0, semana: 0 }]));
  if (!ids.length) return trafego;
  const supabase = await createClient();
  const { data: ligados, error } = await supabase.from("funil_numeros").select("dc_id, monitor_numero_id").in("monitor_numero_id", ids);
  if (error) throw new Error(`Erro ao carregar os números da Data Crazy: ${error.message}`);
  const doMonitor = new Map((ligados ?? []).map((n) => [String(n.dc_id), Number(n.monitor_numero_id)]));
  if (!doMonitor.size) return trafego;
  const hoje = hojeBrasilia();
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  const desde = d.toISOString().slice(0, 10);
  for (let de = 0; ; de += 1000) {
    const { data, error: e } = await supabase
      .from("funil_leads")
      .select("numero_dc_id, dia")
      .in("numero_dc_id", [...doMonitor.keys()])
      .gte("dia", desde)
      .eq("interno", false)
      .order("dc_id")
      .range(de, de + 999);
    if (e) throw new Error(`Erro ao contar os leads por número: ${e.message}`);
    for (const l of data) {
      const t = trafego.get(doMonitor.get(String(l.numero_dc_id))!);
      if (!t) continue;
      t.semana++;
      if (String(l.dia) === hoje) t.hoje++;
    }
    if (data.length < 1000) break;
  }
  return trafego;
}

/** Nome de uma BM pelo id (para montar o apelido padrão). */
export async function nomesDasBms(): Promise<Map<number, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("monitor_bms").select("id, nome");
  if (error) throw new Error(`Erro ao carregar as BMs: ${error.message}`);
  return new Map(data.map((bm) => [bm.id as number, bm.nome as string]));
}
