// Regras da tela de Vendas no formato do Lock in (masterview), por vendedor.
// Sem banco e sem tela. Dinheiro em centavos. Os valores de cada venda vêm da cópia
// guardada nela (snapshot): mudar ou desativar ticket nunca recalcula venda antiga.
// Diferença do resumir() de regras.ts: aqui "total de vendas" = TODAS as pagas (com e
// sem ticket), como no Lock in; sem ticket conta só na quantidade.

import { centavos, FAIXAS, type Faixa, type StatusVenda } from "./regras";

export type TicketLI = {
  id: number;
  nome: string;
  cor: string;
  ordem: number;
  provisorio: boolean;
  ativo: boolean;
  valor_bruto: number;
  valor_liquido: number;
  comissao_6: number;
  comissao_7: number;
  comissao_8: number;
  comissao_9: number;
  comissao_10: number;
};

/** Venda como a tela usa. cliente = "Nome -1234" (primeiro nome + final), "" se não puder ver. */
export type VendaLI = {
  id: number;
  id_fatura: string;
  vendedor_id: number | null;
  sem_vendedor: boolean;
  ticket_id: number | null;
  principal_produto: boolean;
  motivo_sem_ticket: string | null;
  itens: string[];
  bumps: string[];
  status: StatusVenda;
  data: string;
  pago_em: string | null;
  final_lead: string | null;
  origem: "webhook" | "importacao" | "manual";
  snap_bruto: number | string | null;
  snap_liquido: number | string | null;
  snap_comissao_6: number | string | null;
  snap_comissao_7: number | string | null;
  snap_comissao_8: number | string | null;
  snap_comissao_9: number | string | null;
  snap_comissao_10: number | string | null;
  cliente: string;
};

/** cor neutra para ticket sem cor cadastrada */
export const COR_NEUTRA = "#8a96a3";

const zero = (): Record<Faixa, number> => ({ 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 });

// ---------- valores de uma venda ----------
export function brutoVenda(v: VendaLI, t: TicketLI | undefined): number | null {
  if (v.snap_bruto != null) return centavos(v.snap_bruto);
  return t ? centavos(t.valor_bruto) : null;
}
export function liquidoVenda(v: VendaLI, t: TicketLI | undefined): number | null {
  if (v.snap_bruto != null) return v.snap_liquido == null ? null : centavos(v.snap_liquido);
  return t ? centavos(t.valor_liquido) : null;
}
export function comissaoVenda(v: VendaLI, t: TicketLI | undefined, m: Faixa): number | null {
  if (v.snap_bruto != null) {
    const c = v[`snap_comissao_${m}`];
    return c == null ? null : centavos(c);
  }
  return t ? centavos(t[`comissao_${m}`]) : null;
}

// ---------- resumo ----------
export type LinhaTicket = { ticket: TicketLI; qtd: number; bruto: number; liquido: number; comissao: Record<Faixa, number> };

export type ResumoLI = {
  /** todas as pagas */
  qtd: number;
  bruto: number;
  liquido: number;
  comissao: Record<Faixa, number>;
  /** pagas sem ticket que deveriam ter ("a revisar") */
  semTicket: number;
  /** pagas cujo principal é produto ("sem comissão (produto)") */
  semTicketProduto: number;
  /** tickets com venda paga, na ordem da tabela */
  porTicket: LinhaTicket[];
  reembolsos: number;
  chargebacks: number;
};

export function resumirLI(vendas: VendaLI[], tickets: TicketLI[]): ResumoLI {
  const linhas = new Map<number, LinhaTicket>();
  let semTicket = 0;
  let semTicketProduto = 0;
  let reembolsos = 0;
  let chargebacks = 0;
  for (const v of vendas) {
    if (v.status === "reembolso") reembolsos++;
    if (v.status === "chargeback") chargebacks++;
    if (v.status !== "pago") continue;
    const t = v.ticket_id ? tickets.find((x) => x.id === v.ticket_id) : undefined;
    if (!t) {
      if (v.principal_produto) semTicketProduto++;
      else semTicket++;
      continue;
    }
    const l = linhas.get(t.id) ?? { ticket: t, qtd: 0, bruto: 0, liquido: 0, comissao: zero() };
    l.qtd++;
    l.bruto += brutoVenda(v, t) ?? 0;
    l.liquido += liquidoVenda(v, t) ?? 0;
    for (const m of FAIXAS) l.comissao[m] += comissaoVenda(v, t, m) ?? 0;
    linhas.set(t.id, l);
  }
  const porTicket = [...tickets].sort((a, b) => a.ordem - b.ordem).filter((t) => linhas.has(t.id)).map((t) => linhas.get(t.id)!);
  const r: ResumoLI = { qtd: semTicket + semTicketProduto, bruto: 0, liquido: 0, comissao: zero(), semTicket, semTicketProduto, porTicket, reembolsos, chargebacks };
  for (const l of porTicket) {
    r.qtd += l.qtd;
    r.bruto += l.bruto;
    r.liquido += l.liquido;
    for (const m of FAIXAS) r.comissao[m] += l.comissao[m];
  }
  return r;
}

// ---------- textos ----------
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-09" → "Setembro" */
export function mesCapitalizado(mes: string): string {
  const n = MESES[Number(mes.slice(5, 7)) - 1];
  return n[0].toUpperCase() + n.slice(1);
}
/** 7 → "julho" */
export const nomeDoMesNumero = (m: number) => MESES[m - 1];

/** 123456 → "R$ 1.234,56" (espaço comum, bom para colar no WhatsApp) */
export const brl = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 28800 → "R$288"; 16890 → "R$168,90" */
function precoCurto(c: number) {
  const resto = c % 100;
  return `R$${Math.floor(c / 100).toLocaleString("pt-BR")}${resto ? `,${String(resto).padStart(2, "0")}` : ""}`;
}

const rotuloTicket = (t: TicketLI) => precoCurto(centavos(t.valor_bruto)) + (t.provisorio ? " (provisório)" : "");

/** "Copiar resumo" (prestação comercial). */
export function textoResumo(r: ResumoLI, margem: Faixa): string {
  return [
    "PRESTAÇÃO COMERCIAL GCS",
    "",
    `Total de vendas: ${r.qtd}`,
    `Faturamento bruto: ${brl(r.bruto)}`,
    `Líquido: ${brl(r.liquido)}`,
    "",
    `Margem: ${margem}%`,
    `Comissão: ${brl(r.comissao[margem])}`,
    "",
    "Vendas:",
    ...[
      ...r.porTicket.map((l) => ({ qtd: l.qtd, ordem: l.ticket.ordem, txt: rotuloTicket(l.ticket) })),
      ...(r.semTicketProduto ? [{ qtd: r.semTicketProduto, ordem: 998, txt: "sem comissão (produto)" }] : []),
      ...(r.semTicket ? [{ qtd: r.semTicket, ordem: 999, txt: "sem comissão definida" }] : []),
    ]
      .sort((a, b) => b.qtd - a.qtd || a.ordem - b.ordem)
      .map((x) => `${x.qtd}x ${x.txt}`),
  ].join("\n");
}

/** comissão − adiantamentos (centavos), nunca negativo */
export function valorFinalDe(comissao: number, adiantamentos: { valor: number }[]): number {
  return Math.max(0, comissao - adiantamentos.reduce((s, a) => s + a.valor, 0));
}

/** Mensagem do "Enviar pro Rodrigo" (negrito *…* do WhatsApp). */
export function textoFechamento(p: {
  mes: string;
  resumo: ResumoLI;
  margem: Faixa;
  observacoes: string;
  link: string | null;
  adiantamentos: { valor: number; data: string }[];
}): string {
  const { resumo: r, margem } = p;
  const nome = mesCapitalizado(p.mes);
  const vendas = (n: number) => `${n} venda${n === 1 ? "" : "s"}`;
  const porTicket = [
    ...r.porTicket.map((l) => ({ qtd: l.qtd, txt: rotuloTicket(l.ticket) })),
    ...(r.semTicketProduto ? [{ qtd: r.semTicketProduto, txt: "sem comissão (produto)" }] : []),
    ...(r.semTicket ? [{ qtd: r.semTicket, txt: "sem comissão definida" }] : []),
  ].sort((a, b) => b.qtd - a.qtd);
  const obs = p.observacoes.trim();
  return [
    "📊 *Resumo Geral*",
    "",
    `🐲 Mês de ${nome}: ${brl(r.bruto)}`,
    `🍄 Total de Vendas: ${r.qtd} vendas aprovadas`,
    `💰 Comissão Total: ${brl(r.comissao[margem])}`,
    "",
    "🔄 *Reembolsos & Chargebacks*",
    "",
    `📥 Reembolsos: ${r.reembolsos}`,
    `💳 Chargebacks: ${r.chargebacks}`,
    "",
    "📝 *Observações Importantes*",
    "",
    `-${margem}%`,
    ...porTicket.map((x) => `-${vendas(x.qtd)} ${x.txt}`),
    ...(p.adiantamentos.length
      ? [
          "",
          `-Comissão (${margem}%): ${brl(r.comissao[margem])}`,
          ...p.adiantamentos.map((a) => `Adiantamento no dia ${a.data.slice(8, 10)}/${a.data.slice(5, 7)}: -${brl(a.valor)}`),
          `Valor final a receber: ${brl(valorFinalDe(r.comissao[margem], p.adiantamentos))}`,
        ]
      : []),
    ...(obs ? [obs] : []),
    ...(p.link ? ["", `📂 Vendas de ${nome}`, p.link] : []),
  ].join("\n");
}

// ---------- resumo anual ----------
export type MesAnual = {
  mes: number;
  vendas: number;
  comissao: number;
  /** % usado: o do fechamento, senão o sugerido pela margem; null = ainda sem % (mostra a 10%) */
  margem: Faixa | null;
  fonte: "fechamento" | "calculado" | null;
  reembolsos: number;
  chargebacks: number;
  adiantamentos: { id: number; valor: number; data: string }[];
  valorFinal: number | null;
  /** o fechamento gravado não bate com as vendas de agora */
  difere: boolean;
};

export function resumoAnual(
  ano: number,
  vendas: VendaLI[],
  tickets: TicketLI[],
  fechamentos: { mes: string; faixa: Faixa; qtd: number; comissao: number }[],
  sugeridas: Map<string, Faixa | null>,
  adiantamentos: { id: number; mes: string; valor: number; data: string }[],
): MesAnual[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    const doMes = vendas.filter((v) => v.data.startsWith(chave));
    const r = resumirLI(doMes, tickets);
    const f = fechamentos.find((x) => x.mes === chave);
    const margem = f?.faixa ?? sugeridas.get(chave) ?? null;
    const adiant = adiantamentos.filter((a) => a.mes === chave).sort((a, b) => a.data.localeCompare(b.data));
    const tem = r.qtd > 0 || r.reembolsos > 0 || !!f;
    const comissao = r.comissao[margem ?? 10];
    return {
      mes,
      vendas: r.qtd,
      comissao: tem ? comissao : 0,
      margem,
      fonte: f ? "fechamento" : tem ? "calculado" : null,
      reembolsos: r.reembolsos,
      chargebacks: r.chargebacks,
      adiantamentos: adiant,
      valorFinal: tem ? valorFinalDe(comissao, adiant) : null,
      difere: !!f && (f.comissao !== r.comissao[f.faixa] || f.qtd !== r.qtd),
    };
  });
}

// ---------- importação de CSV (formato do Notion do Lock in) ----------
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const fechar = () => {
    linha.push(campo);
    campo = "";
    if (linha.some((x) => x.trim())) linhas.push(linha);
    linha = [];
  };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === "," || c === ";") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      fechar();
    } else campo += c;
  }
  fechar();
  return linhas;
}

const MESES_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "September 25, 2026", "25/09/2026", "2026-09-25", "25 de setembro de 2026" → "2026-09-25" */
export function lerData(bruta: string): string | null {
  const s = bruta.trim().toLowerCase();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = (y: number, m: number, d: number) => {
    const r = `${y}-${p(m)}-${p(d)}`;
    const dt = new Date(`${r}T12:00:00Z`);
    return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === r ? r : null;
  };
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^([a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (m && MESES_EN.includes(m[1])) return iso(+m[3], MESES_EN.indexOf(m[1]) + 1, +m[2]);
  m = s.match(/^(\d{1,2})\s+de\s+([a-zç]+)\.?\s+de\s+(\d{4})/);
  if (m) {
    const i = MESES.findIndex((x) => x.startsWith(m![2].slice(0, 3)));
    if (i >= 0) return iso(+m[3], i + 1, +m[1]);
  }
  return null;
}

/** "R$ 288", "288,00", "288" ou o nome do ticket → ticket */
export function acharTicket(categoria: string, tickets: TicketLI[]): TicketLI | null {
  const c = categoria.trim().toLowerCase();
  if (!c) return null;
  const porNome = tickets.find((t) => t.nome.trim().toLowerCase() === c);
  if (porNome) return porNome;
  const num = c.replace(/r\$|\s/g, "").replace(/\./g, "").match(/\d+(?:,\d{1,2})?/)?.[0];
  if (!num) return null;
  const cents = Math.round(parseFloat(num.replace(",", ".")) * 100);
  return tickets.find((t) => centavos(t.valor_bruto) === cents) ?? null;
}

export type LinhaImportacao = {
  linha: number;
  nome: string;
  digitos: string;
  categoria: string;
  ticketId: number | null;
  ticketNome: string | null;
  status: StatusVenda | null;
  data: string | null;
  problemas: string[];
};

const STATUS_CSV: Record<string, StatusVenda> = { pago: "pago", paga: "pago", reembolso: "reembolso", reembolsada: "reembolso", chargeback: "chargeback" };

/** CSV com as colunas Nome ("Lucas -1389"), Categoria (ticket), Status e Date. */
export function analisarCsv(texto: string, tickets: TicketLI[]): { erro: string } | { linhas: LinhaImportacao[] } {
  const [cab, ...corpo] = lerCsv(texto);
  if (!cab) return { erro: "O arquivo está vazio." };
  const col = (n: string) => cab.findIndex((h) => h.trim().toLowerCase() === n);
  const idx = { nome: col("nome"), categoria: col("categoria"), status: col("status"), data: col("date") };
  const faltando = Object.entries(idx).filter(([, i]) => i < 0).map(([k]) => (k === "data" ? "date" : k));
  if (faltando.length) return { erro: `Faltam colunas no CSV: ${faltando.join(", ")}.` };
  return {
    linhas: corpo.map((c, i) => {
      const cel = (k: keyof typeof idx) => (c[idx[k]] ?? "").trim();
      const bruto = cel("nome").replace(/\s+/g, " ");
      const m = bruto.match(/^(.*?)\s*-\s*(\d{4})$/);
      const nome = (m ? m[1] : bruto).split(" ")[0] ?? "";
      const ticket = acharTicket(cel("categoria"), tickets);
      const status = STATUS_CSV[cel("status").toLowerCase()] ?? null;
      const data = lerData(cel("data"));
      const problemas: string[] = [];
      if (!nome) problemas.push("sem nome");
      if (!ticket) problemas.push(cel("categoria") ? `ticket "${cel("categoria")}" não existe` : "sem ticket");
      if (!status) problemas.push(`status "${cel("status")}" inválido`);
      if (!data) problemas.push(`data "${cel("data")}" inválida`);
      return { linha: i + 2, nome, digitos: m?.[2] ?? "", categoria: cel("categoria"), ticketId: ticket?.id ?? null, ticketNome: ticket?.nome ?? null, status, data, problemas };
    }),
  };
}
