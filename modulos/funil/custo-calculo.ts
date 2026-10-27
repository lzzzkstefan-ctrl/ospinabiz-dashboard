// Contas da tela "Custo de mensagens" (Funil). Sem banco nem API: recebe as linhas já lidas.
// Regras em docs/modulos/funil.md ("Custo de mensagens").
//
// Custo = mensagens COBRADAS × preço (a franquia do mês e a janela grátis de anúncio saem de graça).
// Mensagem de lead marcado como interno (teste) fica fora das contas por lead, mas a Meta cobra:
// entra só na comparação estimado × real.

export const GRUPOS_CUSTO = ["sem_etapa", "perguntas", "parte1", "parte2", "sem_dinheiro", "pagamento", "comprou"] as const;
export type GrupoCusto = (typeof GRUPOS_CUSTO)[number];
export const NOME_DO_GRUPO: Record<GrupoCusto, string> = {
  sem_etapa: "Antes da 1ª etapa",
  perguntas: "Perguntas iniciais",
  parte1: "Parte 1",
  parte2: "Parte 2",
  sem_dinheiro: "Sem dinheiro / downsell",
  pagamento: "Pagamento",
  comprou: "Comprou (depois da compra)",
};

export type Cobranca = "gratis_anuncio" | "franquia" | "cobrada" | "nao_cobrada";
export type OrigemLead = "link" | "ctwa";
export type Produto = "gcs" | "viral";

/** Uma linha da visão funil_custo_resumo (mensagens agrupadas). */
export type LinhaResumo = {
  dia: string;
  lead_dc_id: string | null;
  numero_dc_id: string | null;
  etapa_custo: string;
  cobranca: string;
  origem: string;
  tipo: string;
  antes_da_compra: boolean | null;
  interno: boolean;
  mensagens: number;
  entregues: number;
};

export type LeadCusto = {
  dc_id: string;
  dia: string;
  atendente_dc_id: string | null;
  origem: OrigemLead;
  compra: string | null;
  comprou_em: string | null;
  downsell: string | null;
  interno: boolean;
};

export type VendaCusto = { linha: Produto; valor_pago: number | null };

export type EntradaCusto = {
  preco: number;
  /** linhas do período (já sem as de outro vendedor, se houver filtro) */
  linhas: LinhaResumo[];
  /** linhas (de qualquer data) dos leads que compraram no período */
  linhasDosCompradores: LinhaResumo[];
  /** leads que entraram no período */
  leadsQueEntraram: LeadCusto[];
  /** leads que compraram no período (comprou_em no período) */
  compradores: LeadCusto[];
  /** lead → dados (para origem e produto das linhas) */
  leads: Map<string, LeadCusto>;
  vendas: VendaCusto[];
  produto: Produto | null;
};

export type LinhaEtapa = { grupo: GrupoCusto; nome: string; mensagens: number; leads: number; porLead: number | null; custo: number; custoPorLead: number | null };
export type LinhaOrigem = { origem: OrigemLead; leads: number; mensagens: number; custo: number; compras: number; custoPorCompra: number | null };

export type ResultadoCusto = {
  mensagens: number;
  entregues: number;
  cobradas: number;
  custo: number;
  porCobranca: Record<Cobranca, number>;
  porQuem: { automacao: number; atendente: number; celular: number };
  custoPorQuem: { automacao: number; atendente: number; celular: number };
  porTipo: Record<string, number>;
  etapas: LinhaEtapa[];
  leadsQueEntraram: number;
  custoPorLeadQueEntrou: number | null;
  compradores: number;
  custoPorComprador: number | null;
  mensagensAteCompra: { media: number | null; mediana: number | null };
  vendas: { total: number; gcs: number; viral: number };
  custoPorVenda: { total: number | null; gcs: number | null; viral: number | null };
  faturamento: number;
  pctFaturamento: number | null;
  porOrigem: LinhaOrigem[];
};

const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Produto da compra do lead: venda do Protocolo Viral (downsell 'viral') ou GCS. */
export function produtoDoLead(l: Pick<LeadCusto, "downsell">): Produto {
  return l.downsell === "viral" ? "viral" : "gcs";
}

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function calcularCusto(e: EntradaCusto): ResultadoCusto {
  const preco = e.preco;
  const linhas = e.linhas.filter((l) => !l.interno);
  const cobradasDe = (l: LinhaResumo) => (l.cobranca === "cobrada" ? l.mensagens : 0);

  const porCobranca: Record<Cobranca, number> = { gratis_anuncio: 0, franquia: 0, cobrada: 0, nao_cobrada: 0 };
  const porQuem = { automacao: 0, atendente: 0, celular: 0 };
  const custoPorQuem = { automacao: 0, atendente: 0, celular: 0 };
  const porTipo: Record<string, number> = {};
  const etapa = new Map<GrupoCusto, { mensagens: number; cobradas: number; leads: Set<string> }>();
  let mensagens = 0;
  let entregues = 0;
  let cobradas = 0;

  for (const l of linhas) {
    mensagens += l.mensagens;
    entregues += l.entregues;
    cobradas += cobradasDe(l);
    if (l.cobranca in porCobranca) porCobranca[l.cobranca as Cobranca] += l.mensagens;
    if (l.origem in porQuem) {
      porQuem[l.origem as keyof typeof porQuem] += l.mensagens;
      custoPorQuem[l.origem as keyof typeof porQuem] += cobradasDe(l) * preco;
    }
    porTipo[l.tipo] = (porTipo[l.tipo] ?? 0) + l.mensagens;
    const g = (GRUPOS_CUSTO as readonly string[]).includes(l.etapa_custo) ? (l.etapa_custo as GrupoCusto) : "sem_etapa";
    const x = etapa.get(g) ?? { mensagens: 0, cobradas: 0, leads: new Set<string>() };
    x.mensagens += l.mensagens;
    x.cobradas += cobradasDe(l);
    if (l.lead_dc_id) x.leads.add(l.lead_dc_id);
    etapa.set(g, x);
  }
  const custo = cobradas * preco;

  const etapas: LinhaEtapa[] = GRUPOS_CUSTO.map((g) => {
    const x = etapa.get(g) ?? { mensagens: 0, cobradas: 0, leads: new Set<string>() };
    const c = x.cobradas * preco;
    return { grupo: g, nome: NOME_DO_GRUPO[g], mensagens: x.mensagens, leads: x.leads.size, porLead: div(x.mensagens, x.leads.size), custo: c, custoPorLead: div(c, x.leads.size) };
  });

  // compradores do período (com o filtro de produto): custo e mensagens até a compra
  const compradores = e.compradores.filter((l) => !l.interno && (!e.produto || produtoDoLead(l) === e.produto));
  const ids = new Set(compradores.map((l) => l.dc_id));
  const ateCompra = new Map<string, { mensagens: number; cobradas: number }>();
  for (const l of e.linhasDosCompradores) {
    if (!l.lead_dc_id || !ids.has(l.lead_dc_id) || l.antes_da_compra !== true) continue;
    const x = ateCompra.get(l.lead_dc_id) ?? { mensagens: 0, cobradas: 0 };
    x.mensagens += l.mensagens;
    x.cobradas += cobradasDe(l);
    ateCompra.set(l.lead_dc_id, x);
  }
  const contagens = compradores.map((l) => ateCompra.get(l.dc_id)?.mensagens ?? 0);
  const custoCompradores = compradores.reduce((s, l) => s + (ateCompra.get(l.dc_id)?.cobradas ?? 0) * preco, 0);

  // vendas e faturamento do período
  const vendas = e.vendas.filter((v) => !e.produto || v.linha === e.produto);
  const qtd = { total: vendas.length, gcs: vendas.filter((v) => v.linha === "gcs").length, viral: vendas.filter((v) => v.linha === "viral").length };
  const faturamento = vendas.reduce((s, v) => s + (v.valor_pago ?? 0), 0);

  // por origem do lead (link × Click-to-WhatsApp)
  const leadsQueEntraram = e.leadsQueEntraram.filter((l) => !l.interno);
  const porOrigem: LinhaOrigem[] = (["link", "ctwa"] as const).map((o) => {
    let msgs = 0;
    let cob = 0;
    for (const l of linhas) {
      const lead = l.lead_dc_id ? e.leads.get(l.lead_dc_id) : undefined;
      if ((lead?.origem ?? "link") !== o) continue;
      msgs += l.mensagens;
      cob += cobradasDe(l);
    }
    const compras = compradores.filter((l) => l.origem === o).length;
    return {
      origem: o,
      leads: leadsQueEntraram.filter((l) => l.origem === o).length,
      mensagens: msgs,
      custo: cob * preco,
      compras,
      custoPorCompra: div(cob * preco, compras),
    };
  });

  return {
    mensagens,
    entregues,
    cobradas,
    custo,
    porCobranca,
    porQuem,
    custoPorQuem,
    porTipo,
    etapas,
    leadsQueEntraram: leadsQueEntraram.length,
    custoPorLeadQueEntrou: div(custo, leadsQueEntraram.length),
    compradores: compradores.length,
    custoPorComprador: div(custoCompradores, compradores.length),
    mensagensAteCompra: { media: div(contagens.reduce((s, n) => s + n, 0), contagens.length), mediana: mediana(contagens) },
    vendas: qtd,
    custoPorVenda: { total: div(custo, qtd.total), gcs: div(custo, qtd.gcs), viral: div(custo, qtd.viral) },
    faturamento,
    pctFaturamento: div(custo, faturamento),
    porOrigem,
  };
}
