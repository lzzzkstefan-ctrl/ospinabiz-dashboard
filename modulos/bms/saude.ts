// Saúde dos números principais (sem banco, sem tela): contador do teste, limite e qualidade da Meta,
// alertas e a comparação "Antes (vários números) x Agora (2 números isolados)".
// Leitura em ./dados.ts; contexto em docs/modulos/bms.md.

import type { Qualidade } from "./regras";

/** Custo das mensagens começa a ser lido em 01/10/2026 (mesma data do Funil, INICIO_DO_CUSTO). */
export const INICIO_DO_CUSTO = "2026-10-01";

/** Volume do dia acima desta fração do limite liga o alerta. */
export const ALERTA_LIMITE = 0.8;

/** "2026-10-29" + n dias. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dias corridos de `de` até `ate` (mesmo dia = 0). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Meta: limite (tier) e qualidade
// ---------------------------------------------------------------------------

/** messaging_limit_tier da Meta → limite de contatos por 24 h (null = ilimitado ou desconhecido). */
export function limiteDoTier(tier: string | null | undefined): number | null {
  const m = /^TIER_(\d+)(K?)$/.exec(tier ?? "");
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

/** quality_rating da Meta (GREEN/YELLOW/RED) → verde/amarela/vermelha; UNKNOWN e outros = null. */
export function qualidadeDaMeta(rating: string | null | undefined): Qualidade | null {
  return rating === "GREEN" ? "verde" : rating === "YELLOW" ? "amarela" : rating === "RED" ? "vermelha" : null;
}

/** De onde veio o limite/qualidade mostrado no card. */
export type FonteMeta = { fonte: "meta" } | { fonte: "manual"; motivo: string };

// ---------------------------------------------------------------------------
// Observação livre: nunca credencial nem IP de proxy
// ---------------------------------------------------------------------------

/** Devolve o erro se a observação parecer ter usuário, senha ou IP; null se estiver ok. */
export function problemaNaObservacao(texto: string): string | null {
  if (/\b\d{1,3}(\.\d{1,3}){3}\b/.test(texto)) return "Tire o IP: a observação não guarda IP de proxy.";
  if (/\b(senha|password|passwd|pass|pwd|login|usu[aá]rio|user(name)?)\s*[:=]/i.test(texto)) return "Tire usuário e senha: a observação é só texto descritivo.";
  if (/\S+:\S+@\S+/.test(texto)) return "Tire o usuário:senha@ da observação.";
  return null;
}

// ---------------------------------------------------------------------------
// Alertas do card
// ---------------------------------------------------------------------------

/** Alertas visuais: qualidade amarela/vermelha ou contatos do dia acima de 80% do limite. */
export function alertasDoNumero(a: { qualidade: Qualidade | null; limite: number | null; contatosHoje: number | null }): string[] {
  const alertas: string[] = [];
  if (a.qualidade === "vermelha") alertas.push("Qualidade vermelha na Meta: risco alto de restrição.");
  else if (a.qualidade === "amarela") alertas.push("Qualidade amarela na Meta: segure o volume.");
  if (a.limite && a.contatosHoje !== null && a.contatosHoje > a.limite * ALERTA_LIMITE)
    alertas.push(`Volume de hoje em ${Math.round((a.contatosHoje / a.limite) * 100)}% do limite (${a.contatosHoje} de ${a.limite} contatos).`);
  return alertas;
}

// ---------------------------------------------------------------------------
// Comparação do teste
// ---------------------------------------------------------------------------

export type LeadComparacao = { dia: string; numero: string | null; vendeuEm: string | null };
export type CustoDia = { dia: string; numero: string | null; cobradas: number };
export type NumeroBanido = { dcIds: string[]; banidoEm: string };

export type LadoComparacao = {
  /** média de dias do 1º lead até o ban (antes) ou dias sem ban até hoje (agora) */
  diasAteBan: number | null;
  /** quantos números entraram na média */
  numerosNaMedia: number;
  leadsPorDia: number | null;
  custoPorVenda: number | null;
  vendas: number;
  dias: number;
};
export type Comparacao = { inicio: string; antes: LadoComparacao; agora: LadoComparacao & { aindaSemBan: boolean } };

/**
 * Antes = toda a operação até a véspera do teste (vários números). Agora = só os números principais
 * desde o começo do teste.
 * - Dias até o ban (antes): para cada número banido antes do teste, do 1º lead dele até a data do ban.
 *   Agora: dias desde o começo do teste (nenhum principal banido = o contador ainda corre).
 * - Leads por dia: leads (sem internos) ÷ dias do período. Antes: do 1º lead da operação à véspera.
 * - Custo por venda: mensagens cobradas × preço ÷ vendas do mesmo período. Antes só conta desde
 *   01/10/2026, quando o custo começou a ser lido.
 */
export function compararTeste(e: {
  inicio: string;
  hoje: string;
  preco: number;
  leads: LeadComparacao[];
  custo: CustoDia[] | null;
  banidosAntes: NumeroBanido[];
  principais: { dcIds: string[]; banidoEm: string | null }[];
}): Comparacao {
  const vespera = somarDias(e.inicio, -1);
  const dcPrincipais = new Set(e.principais.flatMap((p) => p.dcIds));
  const ehDoAgora = (numero: string | null) => numero !== null && dcPrincipais.has(numero);

  // dias até o ban (antes): 1º lead de cada número banido até o ban
  const primeiroLead = new Map<string, string>();
  for (const l of e.leads) if (l.numero && (!primeiroLead.has(l.numero) || l.dia < primeiroLead.get(l.numero)!)) primeiroLead.set(l.numero, l.dia);
  const diasBan = e.banidosAntes
    .filter((b) => b.banidoEm < e.inicio)
    .map((b) => {
      const primeiros = b.dcIds.map((d) => primeiroLead.get(d)).filter((d): d is string => !!d && d <= b.banidoEm);
      return primeiros.length ? diasEntre(primeiros.sort()[0], b.banidoEm) : null;
    })
    .filter((d): d is number => d !== null);

  const leadsAntes = e.leads.filter((l) => l.dia < e.inicio);
  const primeiroDia = leadsAntes.reduce<string | null>((m, l) => (m === null || l.dia < m ? l.dia : m), null);
  const diasAntes = primeiroDia ? diasEntre(primeiroDia, vespera) + 1 : 0;
  const diasAgora = diasEntre(e.inicio, e.hoje) + 1;
  const leadsAgora = e.leads.filter((l) => l.dia >= e.inicio && ehDoAgora(l.numero));

  const vendasAntesCusto = e.leads.filter((l) => l.vendeuEm && l.vendeuEm >= INICIO_DO_CUSTO && l.vendeuEm < e.inicio).length;
  const vendasAntes = e.leads.filter((l) => l.vendeuEm && l.vendeuEm < e.inicio).length;
  const vendasAgora = e.leads.filter((l) => l.vendeuEm && l.vendeuEm >= e.inicio && ehDoAgora(l.numero)).length;

  const custo = (filtro: (c: CustoDia) => boolean) => (e.custo ? e.custo.filter(filtro).reduce((s, c) => s + c.cobradas, 0) * e.preco : null);
  const custoAntes = custo((c) => c.dia >= INICIO_DO_CUSTO && c.dia < e.inicio);
  const custoAgora = custo((c) => c.dia >= e.inicio && ehDoAgora(c.numero));
  const porVenda = (c: number | null, v: number) => (c === null || v === 0 ? null : c / v);

  const banidoAgora = e.principais.map((p) => p.banidoEm).filter((d): d is string => !!d && d >= e.inicio).sort()[0] ?? null;

  return {
    inicio: e.inicio,
    antes: {
      diasAteBan: diasBan.length ? diasBan.reduce((s, d) => s + d, 0) / diasBan.length : null,
      numerosNaMedia: diasBan.length,
      leadsPorDia: diasAntes > 0 ? leadsAntes.length / diasAntes : null,
      custoPorVenda: porVenda(custoAntes, vendasAntesCusto),
      vendas: vendasAntes,
      dias: diasAntes,
    },
    agora: {
      diasAteBan: banidoAgora ? diasEntre(e.inicio, banidoAgora) : diasEntre(e.inicio, e.hoje),
      numerosNaMedia: e.principais.length,
      aindaSemBan: !banidoAgora,
      leadsPorDia: diasAgora > 0 ? leadsAgora.length / diasAgora : null,
      custoPorVenda: porVenda(custoAgora, vendasAgora),
      vendas: vendasAgora,
      dias: diasAgora,
    },
  };
}
