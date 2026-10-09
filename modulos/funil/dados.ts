// Leitura da tela Funil e Leads, com o usuário logado: o RLS mostra ao vendedor só os
// leads dele (e o registro de contato, com nome e telefone, nunca é lido aqui).

import { createClient } from "@/lib/supabase/server";
import { calcularFunil, type Etapa, type EtiquetaEtapa, type LeadFunil, type Resultado } from "./calculo";

export type FiltrosFunil = { desde: string; ate: string; vendedorId: number | null; numeroId: string | null };

export async function carregarFunil(f: FiltrosFunil): Promise<Resultado> {
  const supabase = await createClient();

  const leads: LeadFunil[] = [];
  for (let de = 0; ; de += 1000) {
    let q = supabase
      .from("funil_leads")
      .select("dc_id, dia, vendedor_id, numero_dc_id, compra, funil_eventos(etiqueta_dc_id, em, origem, acao)")
      .gte("dia", f.desde)
      .lte("dia", f.ate)
      .eq("funil_eventos.acao", "colocou")
      .order("dc_id")
      .range(de, de + 999);
    if (f.vendedorId) q = q.eq("vendedor_id", f.vendedorId);
    if (f.numeroId) q = q.eq("numero_dc_id", f.numeroId);
    const { data, error } = await q;
    if (error) throw new Error(`Erro ao carregar leads: ${error.message}`);
    for (const l of data) {
      leads.push({
        dc_id: l.dc_id,
        dia: String(l.dia),
        vendedor_id: l.vendedor_id,
        numero_dc_id: l.numero_dc_id,
        compra: l.compra as LeadFunil["compra"],
        eventos: (l.funil_eventos ?? []).map((e) => ({
          etiqueta_dc_id: e.etiqueta_dc_id,
          em: String(e.em),
          origem: e.origem as "historico" | "sincronizacao",
        })),
      });
    }
    if (data.length < 1000) break;
  }

  const [etapas, etiquetas] = await Promise.all([
    supabase.from("funil_etapas").select("id, nome, tipo, ordem, perda_na_etapa_id, comprou").eq("ativa", true),
    supabase.from("funil_etiquetas").select("dc_id, etapa_id"),
  ]);
  if (etapas.error) throw new Error(`Erro ao carregar etapas: ${etapas.error.message}`);
  if (etiquetas.error) throw new Error(`Erro ao carregar etiquetas: ${etiquetas.error.message}`);

  return calcularFunil(leads, etapas.data as Etapa[], etiquetas.data as EtiquetaEtapa[], f.desde, f.ate);
}

export type OpcoesFunil = { vendedores: { id: number; nome: string }[]; numeros: { id: string; nome: string }[] };

/** Vendedores (pessoas da equipe ligadas a um atendente que não é suporte) e números da Data Crazy. */
export async function opcoesDoFunil(): Promise<OpcoesFunil> {
  const supabase = await createClient();
  const [atendentes, equipe, numeros] = await Promise.all([
    supabase.from("funil_atendentes").select("equipe_id").eq("suporte_dc", false).not("equipe_id", "is", null),
    supabase.from("equipe").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("funil_numeros").select("dc_id, nome").order("nome"),
  ]);
  const ligados = new Set((atendentes.data ?? []).map((a) => a.equipe_id));
  return {
    vendedores: (equipe.data ?? []).filter((p) => ligados.has(p.id)).map((p) => ({ id: Number(p.id), nome: String(p.nome) })),
    numeros: (numeros.data ?? []).map((n) => ({ id: String(n.dc_id), nome: String(n.nome).trim() })),
  };
}

export type StatusSincronizacao = {
  ultima: { iniciada_em: string; terminada_em: string | null; situacao: "rodando" | "ok" | "falhou"; erro: string | null } | null;
  ultimaOk: string | null;
};

export async function statusDaSincronizacao(): Promise<StatusSincronizacao> {
  const supabase = await createClient();
  const [ultima, ok] = await Promise.all([
    supabase.from("funil_sincronizacoes").select("iniciada_em, terminada_em, situacao, erro").order("id", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("funil_sincronizacoes").select("terminada_em").eq("situacao", "ok").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    ultima: ultima.data ? (ultima.data as StatusSincronizacao["ultima"]) : null,
    ultimaOk: ok.data?.terminada_em ?? null,
  };
}
