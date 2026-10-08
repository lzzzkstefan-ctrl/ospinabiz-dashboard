// Regras do módulo Vendas (sem banco, sem tela). Base: docs/modulos/vendas-referencia.md.
// Dinheiro sempre em centavos (inteiros) para não errar arredondamento.

export const FAIXAS = [6, 7, 8, 9, 10] as const;
export type Faixa = (typeof FAIXAS)[number];
export type StatusVenda = "pago" | "reembolso" | "chargeback";

export type Ticket = {
  id: number;
  valor_bruto: number;
  valor_liquido: number;
  comissao_6: number;
  comissao_7: number;
  comissao_8: number;
  comissao_9: number;
  comissao_10: number;
  ativo: boolean;
};

export type Venda = {
  id: number;
  id_fatura: string;
  vendedor_id: number | null;
  sem_vendedor: boolean;
  forma_atribuicao: "utm" | "manual" | null;
  atribuida_em: string | null;
  utm_term: string | null;
  ticket_id: number | null;
  motivo_sem_ticket: string | null;
  itens: string[];
  bumps: string[];
  valor_pago: number | null;
  status: StatusVenda;
  pago_em: string | null;
  data: string;
  reembolsado_em: string | null;
  final_lead: string | null;
};

export const centavos = (valor: number | string | null | undefined): number => Math.round(Number(valor ?? 0) * 100);

// ---------------------------------------------------------------------------
// Datas (sempre no horário de Brasília)
// ---------------------------------------------------------------------------
const FUSO = "America/Sao_Paulo";

/** Dia em Brasília ("AAAA-MM-DD") de um instante. */
export function diaSP(instante: Date | string): string | null {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d);
}

export function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

export function lerMes(valor: string | string[] | undefined, padrao: string): string {
  return typeof valor === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : padrao;
}

export function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Intervalo [início, fim) do mês, para filtrar vendas.data. */
export function intervaloMes(mes: string): { inicio: string; fim: string } {
  return { inicio: `${mes}-01`, fim: `${somarMes(mes, 1)}-01` };
}

export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, 1)));
  return `${nome} de ${a}`;
}

// ---------------------------------------------------------------------------
// Atribuição pelo link (utm_term)
// ---------------------------------------------------------------------------
export const normalizarTerm = (t: string | null | undefined) => (t ?? "").toLowerCase().replace(/\s+/g, "");

/** Vendedor dono do código do link, ou null (sem código ou código desconhecido → "A atribuir"). */
export function vendedorDoUtm(utmTerm: string | null, vendedores: { equipe_id: number; utm_term: string; ativo: boolean }[]): number | null {
  const t = normalizarTerm(utmTerm);
  if (!t) return null;
  return vendedores.find((v) => v.ativo && normalizarTerm(v.utm_term) === t)?.equipe_id ?? null;
}

/** 4 últimos dígitos do lead: do utm_content "lead_<telefone>" ou, sem ele, do telefone do comprador. */
export function finalDoLead(utmContent: string | null, telefone: string | null): string | null {
  const lead = utmContent?.trim().match(/^lead_(\+?[\d\s().-]+)$/i);
  const digitos = (lead ? lead[1] : (telefone ?? "")).replace(/\D/g, "");
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

// ---------------------------------------------------------------------------
// Ticket x order bump: o ticket é o item com "Game Changer Society" ou
// "Ticket - R$…" no nome; o preço vem do próprio nome. O resto é bump e não conta.
// ---------------------------------------------------------------------------
export const ehItemDeTicket = (nome: string) => /game\s*changer\s*society/i.test(nome) || /ticket\s*-?\s*r\$/i.test(nome);

/** "Ticket - R$168,90" → 16890; "R$ 1.288,00" → 128800; sem preço → null. */
export function precoDoNome(nome: string): number | null {
  const m = nome.match(/r\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!m) return null;
  const [inteiro, decimal = "0"] = m[1].replace(/\./g, "").split(",");
  const valor = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

export function ticketDosItens(
  itens: string[],
  tickets: Ticket[],
): { ticketId: number | null; bumps: string[]; motivo: string | null } {
  const nomes = itens.map((n) => n.trim()).filter(Boolean);
  const item = nomes.find(ehItemDeTicket);
  const bumps = nomes.filter((n) => n !== item);
  if (!item) return { ticketId: null, bumps, motivo: "fatura sem item de ticket" };

  const preco = precoDoNome(item);
  if (preco === null) return { ticketId: null, bumps, motivo: `item sem preço no nome: ${item}` };

  const ticket = tickets.find((t) => t.ativo && centavos(t.valor_bruto) === preco);
  return ticket
    ? { ticketId: ticket.id, bumps, motivo: null }
    : { ticketId: null, bumps, motivo: `ticket de ${precoCurto(preco)} não está na tabela` };
}

// ---------------------------------------------------------------------------
// Totais e comissão: só venda "pago" conta. Comissão = soma das comissões
// unitárias da faixa (nunca porcentagem calculada na hora).
// ---------------------------------------------------------------------------
export type Resumo = {
  qtd: number; // vendas pagas com ticket
  semTicket: number; // vendas pagas sem ticket identificado (sem valor nem comissão)
  bruto: number;
  liquido: number;
  comissao: Record<Faixa, number>;
  porTicket: { ticketId: number; bruto: number; qtd: number }[];
  reembolsos: number;
  chargebacks: number;
};

export function comissaoUnit(t: Ticket, faixa: Faixa): number {
  return centavos(t[`comissao_${faixa}`]);
}

export function resumir(vendas: Venda[], tickets: Ticket[]): Resumo {
  const r: Resumo = {
    qtd: 0,
    semTicket: 0,
    bruto: 0,
    liquido: 0,
    comissao: { 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
    porTicket: [],
    reembolsos: 0,
    chargebacks: 0,
  };
  const porTicket = new Map<number, { ticketId: number; bruto: number; qtd: number }>();

  for (const v of vendas) {
    if (v.status === "reembolso") r.reembolsos += 1;
    if (v.status === "chargeback") r.chargebacks += 1;
    if (v.status !== "pago") continue;

    const t = v.ticket_id ? tickets.find((x) => x.id === v.ticket_id) : undefined;
    if (!t) {
      r.semTicket += 1;
      continue;
    }
    r.qtd += 1;
    r.bruto += centavos(t.valor_bruto);
    r.liquido += centavos(t.valor_liquido);
    for (const f of FAIXAS) r.comissao[f] += comissaoUnit(t, f);
    const linha = porTicket.get(t.id) ?? { ticketId: t.id, bruto: centavos(t.valor_bruto), qtd: 0 };
    linha.qtd += 1;
    porTicket.set(t.id, linha);
  }

  // do maior número de vendas para o menor (empate: ticket mais caro primeiro)
  r.porTicket = [...porTicket.values()].sort((a, b) => b.qtd - a.qtd || b.bruto - a.bruto);
  return r;
}

// ---------------------------------------------------------------------------
// Margem do mês e faixa de comissão
// Lucro = líquido − anúncios − imposto Meta − custos fixos − mensagens
// Margem = Lucro ÷ líquido. A comissão NÃO entra.
// Faixas (limite de baixo entra na faixa de cima): <10 → 6 | 10–<20 → 7 |
// 20–<35 → 8 | 35–50 → 9 | >50 → 10.
// ---------------------------------------------------------------------------
export function faixaDaMargem(margemPct: number): Faixa {
  if (margemPct < 10) return 6;
  if (margemPct < 20) return 7;
  if (margemPct < 35) return 8;
  if (margemPct <= 50) return 9;
  return 10;
}

export type EntradasMes = {
  gastoAnuncios: number | null;
  impostoMeta: number | null;
  custoMensagens: number | null;
};

export type Margem = {
  completa: boolean; // false = falta algum valor do mês → comissão em prévia
  liquido: number;
  custosFixos: number;
  lucro: number | null;
  margemPct: number | null;
  faixa: Faixa | null;
};

export function calcularMargem(liquido: number, entradas: EntradasMes, custosFixos: number): Margem {
  const { gastoAnuncios, impostoMeta, custoMensagens } = entradas;
  const completa = gastoAnuncios !== null && impostoMeta !== null && custoMensagens !== null;
  if (!completa || liquido <= 0) {
    return { completa: false, liquido, custosFixos, lucro: null, margemPct: null, faixa: null };
  }
  const lucro = liquido - gastoAnuncios - impostoMeta - custosFixos - custoMensagens;
  const margemPct = (lucro / liquido) * 100;
  return { completa: true, liquido, custosFixos, lucro, margemPct, faixa: faixaDaMargem(margemPct) };
}

/** Valor de cada custo fixo no mês: o último valor vigente até aquele mês, se o custo estiver ativo. */
export function custosDoMes(
  mes: string,
  custos: { id: number; nome: string; desativado_desde: string | null }[],
  valores: { custo_id: number; vigente_desde: string; valor: number | null }[],
): { id: number; nome: string; valor: number | null }[] {
  const inicio = `${mes}-01`;
  return custos
    .filter((c) => !c.desativado_desde || inicio < c.desativado_desde)
    .map((c) => {
      const vigente = valores
        .filter((v) => v.custo_id === c.id && v.vigente_desde <= inicio)
        .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0];
      return vigente ? { id: c.id, nome: c.nome, valor: vigente.valor === null ? null : centavos(vigente.valor) } : null;
    })
    .filter((c): c is { id: number; nome: string; valor: number | null } => c !== null);
}

// ---------------------------------------------------------------------------
// Formatação e "Copiar resumo"
// ---------------------------------------------------------------------------
/** 123456 → "R$ 1.234,56" */
export function reais(c: number): string {
  return `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 28800 → "R$288"; 16890 → "R$168,90" (como no resumo). */
export function precoCurto(c: number): string {
  const inteiro = c % 100 === 0;
  return `R$${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: inteiro ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Texto do "Copiar resumo", no formato combinado. Sem faixa definida, margem e comissão ficam "a definir". */
export function textoPrestacao(r: Resumo, faixa: Faixa | null): string {
  return [
    "PRESTAÇÃO COMERCIAL GCS",
    "",
    `Total de vendas: ${r.qtd}`,
    `Faturamento bruto: ${reais(r.bruto)}`,
    `Líquido: ${reais(r.liquido)}`,
    "",
    `Margem: ${faixa === null ? "a definir" : `${faixa}%`}`,
    `Comissão: ${faixa === null ? "a definir" : reais(r.comissao[faixa])}`,
    "",
    "Vendas:",
    ...r.porTicket.map((t) => `${t.qtd}x ${precoCurto(t.bruto)}`),
  ].join("\n");
}
