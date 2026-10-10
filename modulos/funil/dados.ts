// Leitura da tela Funil e Leads, com o usuário logado: o RLS mostra ao vendedor só os
// leads dele (e o registro de contato, com nome e telefone, nunca é lido aqui).

import { createClient } from "@/lib/supabase/server";
import { calcularFunil, etapaAtual, mediana, tempoEmAtendimento, type Etapa, type EtiquetaEtapa, type LeadFunil, type Resultado } from "./calculo";

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

/** Nome de cada número (instância) da Data Crazy, para o tooltip e a tabela por número. */
export async function nomesDosNumeros(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("funil_numeros").select("dc_id, nome");
  if (error) throw new Error(`Erro ao carregar números: ${error.message}`);
  return new Map(data.map((n) => [String(n.dc_id), String(n.nome).trim()]));
}

// ---------------------------------------------------------------------------
// Atendimento (migration funil_atendimento). Tudo com o login de quem vê: o vendedor só recebe
// as conversas e os leads dele (RLS).
// ---------------------------------------------------------------------------
export type ConfigFunil = { horasEspera: number; inicio: string; fim: string };

export async function configDoFunil(): Promise<ConfigFunil> {
  const supabase = await createClient();
  const { data } = await supabase.from("funil_config").select("horas_espera, atendimento_inicio, atendimento_fim").maybeSingle();
  return {
    horasEspera: Number(data?.horas_espera ?? 2),
    inicio: String(data?.atendimento_inicio ?? "08:00").slice(0, 5),
    fim: String(data?.atendimento_fim ?? "22:00").slice(0, 5),
  };
}

export type Esperando = {
  conversaId: string;
  rotulo: string | null;
  vendedor: string | null;
  numero: string | null;
  etapa: string | null;
  desde: string;
  /** tempo de espera contando só o horário de atendimento */
  esperaMs: number;
};

/** Conversas ABERTAS cuja última mensagem do lead não teve resposta de atendente há mais de X horas de atendimento. */
export async function leadsEsperando(cfg: ConfigFunil, filtro: { vendedorId: number | null; numeroId: string | null } = { vendedorId: null, numeroId: null }): Promise<Esperando[]> {
  const supabase = await createClient();
  let q = supabase
    .from("funil_conversas")
    .select("dc_id, contato_rotulo, vendedor_id, numero_dc_id, etiquetas_atuais, esperando_desde")
    .not("esperando_desde", "is", null)
    // conversa finalizada na Data Crazy não está esperando (se o lead escrever de novo, ela reabre)
    .eq("finalizada", false)
    .order("esperando_desde")
    .limit(1000);
  if (filtro.vendedorId) q = q.eq("vendedor_id", filtro.vendedorId);
  if (filtro.numeroId) q = q.eq("numero_dc_id", filtro.numeroId);
  const [conversas, etapas, etiquetas, equipe, numeros] = await Promise.all([
    q,
    supabase.from("funil_etapas").select("id, nome, tipo, ordem, perda_na_etapa_id, comprou").eq("ativa", true),
    supabase.from("funil_etiquetas").select("dc_id, etapa_id"),
    supabase.from("equipe").select("id, nome"),
    nomesDosNumeros(),
  ]);
  if (conversas.error) throw new Error(`Erro ao carregar conversas: ${conversas.error.message}`);
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const agora = Date.now();
  return conversas.data
    .map((c) => ({
      conversaId: String(c.dc_id),
      rotulo: c.contato_rotulo,
      vendedor: c.vendedor_id ? (nomeDe.get(Number(c.vendedor_id)) ?? null) : null,
      numero: c.numero_dc_id ? (numeros.get(String(c.numero_dc_id)) ?? null) : null,
      etapa: etapaAtual(c.etiquetas_atuais ?? [], (etiquetas.data ?? []) as EtiquetaEtapa[], (etapas.data ?? []) as Etapa[]),
      desde: String(c.esperando_desde),
      esperaMs: tempoEmAtendimento(String(c.esperando_desde), agora, cfg.inicio, cfg.fim),
    }))
    .filter((e) => e.esperaMs > cfg.horasEspera * 3_600_000)
    .sort((a, b) => b.esperaMs - a.esperaMs);
}

export type PrimeiraResposta = { vendedor: string; leads: number; mediaMs: number; medianaMs: number };

/** Tempo de primeira resposta (horário de atendimento) por quem respondeu, dos leads que entraram no período. */
export async function primeiraResposta(f: FiltrosFunil, cfg: ConfigFunil): Promise<PrimeiraResposta[]> {
  const supabase = await createClient();
  let q = supabase
    .from("funil_leads")
    .select("primeira_msg_lead_em, primeira_resposta_em, primeira_resposta_por")
    .gte("dia", f.desde)
    .lte("dia", f.ate)
    .not("primeira_resposta_em", "is", null)
    .not("primeira_msg_lead_em", "is", null)
    .limit(5000);
  if (f.vendedorId) q = q.eq("vendedor_id", f.vendedorId);
  if (f.numeroId) q = q.eq("numero_dc_id", f.numeroId);
  const [leads, atendentes, equipe] = await Promise.all([q, supabase.from("funil_atendentes").select("dc_id, nome, equipe_id"), supabase.from("equipe").select("id, nome")]);
  if (leads.error) throw new Error(`Erro ao carregar primeira resposta: ${leads.error.message}`);
  const nomeEquipe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const quem = new Map((atendentes.data ?? []).map((a) => [String(a.dc_id), a.equipe_id ? (nomeEquipe.get(Number(a.equipe_id)) ?? String(a.nome)) : String(a.nome)]));
  const grupos = new Map<string, number[]>();
  for (const l of leads.data) {
    const nome = quem.get(String(l.primeira_resposta_por)) ?? "outro atendente";
    const ms = tempoEmAtendimento(String(l.primeira_msg_lead_em), Date.parse(String(l.primeira_resposta_em)), cfg.inicio, cfg.fim);
    grupos.set(nome, [...(grupos.get(nome) ?? []), ms]);
  }
  return [...grupos.entries()]
    .map(([vendedor, ms]) => ({ vendedor, leads: ms.length, mediaMs: ms.reduce((s, x) => s + x, 0) / ms.length, medianaMs: mediana(ms)! }))
    .sort((a, b) => b.leads - a.leads);
}

/** BM (do Monitor) de cada número da Data Crazy. */
export async function bmDosNumeros(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("funil_numeros").select("dc_id, monitor_numeros(monitor_bms(nome))");
  type Linha = { dc_id: string; monitor_numeros: { monitor_bms: { nome: string } | null } | null };
  return new Map(((data ?? []) as unknown as Linha[]).map((n) => [n.dc_id, n.monitor_numeros?.monitor_bms?.nome ?? "sem BM"]));
}

export type Mudanca = { id: number; dia: string; etapa: string | null; descricao: string };

/** Mudanças registradas no funil (marcas nos gráficos). */
export async function mudancasDoFunil(desde?: string, ate?: string): Promise<Mudanca[]> {
  const supabase = await createClient();
  let q = supabase.from("funil_mudancas").select("id, dia, descricao, funil_etapas(nome)").order("dia", { ascending: false });
  if (desde) q = q.gte("dia", desde);
  if (ate) q = q.lte("dia", ate);
  const { data, error } = await q;
  if (error) throw new Error(`Erro ao carregar mudanças: ${error.message}`);
  type Linha = { id: number; dia: string; descricao: string; funil_etapas: { nome: string } | null };
  return ((data ?? []) as unknown as Linha[]).map((m) => ({ id: Number(m.id), dia: String(m.dia), etapa: m.funil_etapas?.nome ?? null, descricao: m.descricao }));
}
