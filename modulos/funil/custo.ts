// Leitura da tela "Custo de mensagens" (Funil, só admin). Com o login de quem vê: as tabelas de
// custo só abrem para admin (RLS). Contas em ./custo-calculo.ts; regras em docs/modulos/funil.md.

import { createClient } from "@/lib/supabase/server";
import { calcularCusto, type LeadCusto, type LinhaResumo, type Produto, type ResultadoCusto, type VendaCusto } from "./custo-calculo";
import type { LinhaFluxo } from "./custo-fluxos";
import { nomesDosAtendentes } from "./dados";
import type { BlocoMapa, CaminhoMapa } from "./mapa-fluxo";
import { INICIO_DO_CUSTO } from "./regras";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ConfigCusto = { preco: number; franquia: number; moeda: string; janelaGratisHoras: number };

export async function configDoCusto(): Promise<ConfigCusto> {
  const supabase = await createClient();
  const { data } = await supabase.from("funil_custo_config").select("preco_mensagem, franquia_mensal, moeda, janela_gratis_horas").maybeSingle();
  return {
    preco: Number(data?.preco_mensagem ?? 0.035),
    franquia: Number(data?.franquia_mensal ?? 1000),
    moeda: String(data?.moeda ?? "BRL"),
    janelaGratisHoras: Number(data?.janela_gratis_horas ?? 72),
  };
}

export type FiltrosCusto = { desde: string; ate: string; atendenteId: string | null; produto: Produto | null };

/** Franquia de um número num mês: quantas mensagens contaram e quando a 1ª foi cobrada. */
export type FranquiaNumero = { mes: string; numeroId: string | null; contadas: number; acabouEm: string | null };
/** Um dia (UTC, como a Meta): custo estimado pelas mensagens lidas × custo que a Meta informou. */
export type DiaComparado = { dia: string; estimado: number; cobradas: number; real: number | null; mensagensMeta: number | null; moedaMeta: string | null };

export type TelaCusto = {
  config: ConfigCusto;
  resultado: ResultadoCusto;
  franquias: FranquiaNumero[];
  comparacao: DiaComparado[];
  /** custo real da Meta já foi lido alguma vez? */
  temCustoReal: boolean;
  /** conversas com mensagem enviada ainda não lida pela sincronização (a leitura anda aos poucos) */
  conversasPendentes: number;
  /** a 1ª mensagem lida (dados de custo começam aqui) */
  primeiraLida: string | null;
};

const inicioSP = (dia: string) => new Date(Date.parse(`${dia}T00:00:00-03:00`)).toISOString();
const fimSP = (dia: string) => new Date(Date.parse(`${dia}T00:00:00-03:00`) + 86_400_000).toISOString();

async function todas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw new Error(`Erro ao carregar o custo de mensagens: ${error.message}`);
    const linhas = (data ?? []) as T[];
    tudo.push(...linhas);
    if (linhas.length < 1000) return tudo;
  }
}

const COLUNAS_LEAD = "dc_id, dia, atendente_dc_id, origem, compra, comprou_em, downsell, interno";
const COLUNAS_RESUMO = "dia, lead_dc_id, numero_dc_id, etapa_custo, cobranca, origem, tipo, antes_da_compra, interno, mensagens, entregues";

/** A visão é agrupada: a paginação precisa da ordem por todas as colunas do grupo (senão repete ou pula linha). */
function ordenado<Q extends { order: (coluna: string, opcoes?: { nullsFirst?: boolean }) => Q }>(q: Q): Q {
  return ["dia", "lead_dc_id", "numero_dc_id", "etapa_custo", "cobranca", "origem", "tipo", "antes_da_compra", "interno"].reduce((x, c) => x.order(c, { nullsFirst: true }), q);
}

async function leadsPorId(supabase: Supabase, ids: string[]): Promise<LeadCusto[]> {
  const fora: LeadCusto[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    fora.push(...(await todas<LeadCusto>((de, ate) => supabase.from("funil_leads").select(COLUNAS_LEAD).in("dc_id", lote).order("dc_id").range(de, ate))));
  }
  return fora;
}

export async function carregarCusto(f: FiltrosCusto): Promise<TelaCusto> {
  const supabase = await createClient();
  const config = await configDoCusto();

  // vendedor = atendente da Data Crazy (dono do lead); nas vendas, a pessoa da equipe ligada a ele
  const equipeDoAtendente = f.atendenteId
    ? ((await supabase.from("funil_atendentes").select("equipe_id").eq("dc_id", f.atendenteId).maybeSingle()).data?.equipe_id ?? null)
    : null;

  const [resumo, entraram, compraram, vendasQ, franquias, diasUtc, meta, pendentes, primeira] = await Promise.all([
    todas<LinhaResumo>((de, ate) => ordenado(supabase.from("funil_custo_resumo").select(COLUNAS_RESUMO).gte("dia", f.desde).lte("dia", f.ate)).range(de, ate)),
    todas<LeadCusto>((de, ate) => {
      let q = supabase.from("funil_leads").select(COLUNAS_LEAD).gte("dia", f.desde).lte("dia", f.ate);
      if (f.atendenteId) q = q.eq("atendente_dc_id", f.atendenteId);
      return q.order("dc_id").range(de, ate);
    }),
    // compradores do período que entraram depois do início do custo (antes disso faltam as mensagens)
    todas<LeadCusto>((de, ate) => {
      let q = supabase
        .from("funil_leads")
        .select(COLUNAS_LEAD)
        .gte("comprou_em", inicioSP(f.desde))
        .lt("comprou_em", fimSP(f.ate))
        .gte("dia", INICIO_DO_CUSTO.slice(0, 10));
      if (f.atendenteId) q = q.eq("atendente_dc_id", f.atendenteId);
      return q.order("dc_id").range(de, ate);
    }),
    todas<{ linha: Produto; valor_pago: number | null; vendedor_id: number | null }>((de, ate) => {
      let q = supabase
        .from("vendas")
        .select("linha, valor_pago, vendedor_id")
        .eq("status", "pago")
        .eq("teste", false)
        .eq("aguardando_confirmacao", false)
        .gte("data", f.desde)
        .lte("data", f.ate);
      if (f.atendenteId) q = equipeDoAtendente ? q.eq("vendedor_id", equipeDoAtendente) : q.eq("id", -1);
      return q.order("id").range(de, ate);
    }),
    todas<{ mes: string; numero_dc_id: string | null; contadas: number; acabou_em: string | null }>((de, ate) =>
      supabase.from("funil_custo_franquia").select("mes, numero_dc_id, contadas, acabou_em").gte("mes", `${f.desde.slice(0, 7)}-01`).lte("mes", f.ate).order("mes").range(de, ate),
    ),
    todas<{ dia: string; cobranca: string; mensagens: number }>((de, ate) =>
      supabase.from("funil_custo_dia_utc").select("dia, cobranca, mensagens").gte("dia", f.desde).lte("dia", f.ate).order("dia").range(de, ate),
    ),
    todas<{ dia: string; custo: number; mensagens: number; moeda: string | null }>((de, ate) =>
      supabase.from("funil_meta_custo_dia").select("dia, custo, mensagens, moeda").gte("dia", f.desde).lte("dia", f.ate).order("dia").range(de, ate),
    ),
    supabase.from("funil_conversas").select("dc_id", { count: "exact", head: true }).gte("ultima_enviada_em", INICIO_DO_CUSTO).is("mensagens_lidas_ate", null),
    supabase.from("funil_mensagens_enviadas").select("enviada_em").order("enviada_em").limit(1).maybeSingle(),
  ]);

  // leads das mensagens (origem, dono e produto)
  const leads = new Map<string, LeadCusto>();
  for (const l of [...entraram, ...compraram]) leads.set(l.dc_id, l);
  const faltam = [...new Set(resumo.map((r) => r.lead_dc_id).filter((id): id is string => !!id && !leads.has(id)))];
  for (const l of await leadsPorId(supabase, faltam)) leads.set(l.dc_id, l);

  // filtro de vendedor: só as mensagens dos leads dele
  const linhas = f.atendenteId ? resumo.filter((r) => r.lead_dc_id && leads.get(r.lead_dc_id)?.atendente_dc_id === f.atendenteId) : resumo;

  // mensagens dos compradores em qualquer data (até a compra)
  const linhasDosCompradores: LinhaResumo[] = [];
  const idsCompradores = compraram.map((l) => l.dc_id);
  for (let i = 0; i < idsCompradores.length; i += 200) {
    const lote = idsCompradores.slice(i, i + 200);
    linhasDosCompradores.push(
      ...(await todas<LinhaResumo>((de, ate) => ordenado(supabase.from("funil_custo_resumo").select(COLUNAS_RESUMO).in("lead_dc_id", lote)).range(de, ate))),
    );
  }

  const vendas: VendaCusto[] = vendasQ.map((v) => ({ linha: v.linha, valor_pago: v.valor_pago === null ? null : Number(v.valor_pago) }));
  const resultado = calcularCusto({
    preco: config.preco,
    linhas,
    linhasDosCompradores,
    leadsQueEntraram: entraram,
    compradores: compraram,
    leads,
    vendas,
    produto: f.produto,
  });

  // estimado × real por dia (UTC), sem filtro: a conta da Meta é da operação inteira
  const dias = new Map<string, DiaComparado>();
  const dia = (d: string) => dias.get(d) ?? { dia: d, estimado: 0, cobradas: 0, real: null, mensagensMeta: null, moedaMeta: null };
  for (const r of diasUtc) {
    if (r.cobranca !== "cobrada") continue;
    const x = dia(r.dia);
    x.cobradas += r.mensagens;
    x.estimado = x.cobradas * config.preco;
    dias.set(r.dia, x);
  }
  for (const m of meta) {
    const x = dia(m.dia);
    x.real = (x.real ?? 0) + Number(m.custo);
    x.mensagensMeta = (x.mensagensMeta ?? 0) + m.mensagens;
    x.moedaMeta = m.moeda;
    dias.set(m.dia, x);
  }

  return {
    config,
    resultado,
    franquias: franquias.map((x) => ({ mes: x.mes, numeroId: x.numero_dc_id, contadas: x.contadas, acabouEm: x.acabou_em })),
    comparacao: [...dias.values()].sort((a, b) => b.dia.localeCompare(a.dia)),
    temCustoReal: meta.length > 0,
    conversasPendentes: pendentes.count ?? 0,
    primeiraLida: primeira.data?.enviada_em ?? null,
  };
}

// ---------------------------------------------------------------------------
// Custo por funil (por automação) e mapa do funil
// ---------------------------------------------------------------------------

const COLUNAS_FLUXO = "dia, origem, fluxo, atendente_dc_id, lead_dc_id, etapa_custo, cobranca, interno, mensagens";

export type TelaCustoFluxos = {
  config: ConfigCusto;
  linhas: LinhaFluxo[];
  /** lead → comprou (a qualquer momento: venda na Hubla ou Pix/CNPJ) */
  compradores: Set<string>;
  atendentes: Map<string, string>;
};

/** Mensagens do período agrupadas por automação/atendente e lead, e quem desses leads comprou. */
export async function carregarCustoFluxos(desde: string, ate: string): Promise<TelaCustoFluxos> {
  const supabase = await createClient();
  const [config, linhas, atendentes] = await Promise.all([
    configDoCusto(),
    todas<LinhaFluxo>((de, fim) =>
      ["dia", "origem", "fluxo", "atendente_dc_id", "lead_dc_id", "etapa_custo", "cobranca", "interno"]
        .reduce((q, c) => q.order(c, { nullsFirst: true }), supabase.from("funil_custo_fluxo").select(COLUNAS_FLUXO).gte("dia", desde).lte("dia", ate))
        .range(de, fim),
    ),
    nomesDosAtendentes(),
  ]);
  const ids = [...new Set(linhas.map((l) => l.lead_dc_id).filter((id): id is string => !!id))];
  const compradores = new Set((await leadsPorId(supabase, ids)).filter((l) => l.compra === "hubla" || l.compra === "fora_hubla").map((l) => l.dc_id));
  return { config, linhas, compradores, atendentes };
}

export type MapaGuardado = { id: number; nome: string; arquivo: string | null; blocos: BlocoMapa[]; caminhos: CaminhoMapa[]; enviadoEm: string };

export async function listarMapas(): Promise<MapaGuardado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("funil_fluxos_mapa").select("id, nome, arquivo, blocos, caminhos, enviado_em").order("nome");
  if (error) throw new Error(`Erro ao carregar o mapa do funil: ${error.message}`);
  return (data ?? []).map((m) => ({
    id: Number(m.id),
    nome: String(m.nome),
    arquivo: m.arquivo ? String(m.arquivo) : null,
    blocos: (m.blocos ?? []) as BlocoMapa[],
    caminhos: (m.caminhos ?? []) as CaminhoMapa[],
    enviadoEm: String(m.enviado_em),
  }));
}
