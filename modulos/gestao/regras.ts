// Regras da central de gestão (fase 2, 21/11/2026): Hoje, Projetos e Decisões. Sem tela, sem banco.
// Contexto em docs/modulos/gestao.md.

export const FUSO = "America/Sao_Paulo";

/** "2026-11-21" no fuso de Brasília. */
export function hojeSP(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana do dia (semana de segunda a domingo). */
export function segundaDa(dia: string): string {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(dia, dow === 0 ? -6 : 1 - dow);
}

/** "2026-11-21" → "21/11"; de outro ano → "21/11/2027". */
export function dataCurta(dia: string, hoje: string): string {
  const [ano, mes, d] = dia.split("-");
  return ano === hoje.slice(0, 4) ? `${d}/${mes}` : `${d}/${mes}/${ano}`;
}

/** Quantos dias faltam (negativo = atrasado). */
export function diasAte(dia: string, hoje: string): number {
  return Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
}

export function textoPrazo(dia: string, hoje: string): string {
  const n = diasAte(dia, hoje);
  if (n < 0) return `atrasado ${-n}d`;
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  return `${dataCurta(dia, hoje)} · ${n}d`;
}

export const formatarBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v >= 1000 ? 0 : 2 });

// ---------------------------------------------------------------------------
// Hoje: prioridades e números
// ---------------------------------------------------------------------------
export const MAX_PRIORIDADES = 3;

export type VendaNumero = { data: string; liquido: number };
export type Numeros = { hoje: { vendas: number; liquido: number }; semana: { vendas: number; liquido: number } };

/** Vendas e líquido de hoje e da semana (a lista já vem só com as vendas que contam). */
export function somarVendas(vendas: VendaNumero[], hoje: string, segunda: string): Numeros {
  const r: Numeros = { hoje: { vendas: 0, liquido: 0 }, semana: { vendas: 0, liquido: 0 } };
  for (const v of vendas) {
    if (v.data < segunda || v.data > hoje) continue;
    r.semana.vendas++;
    r.semana.liquido += v.liquido;
    if (v.data === hoje) {
      r.hoje.vendas++;
      r.hoje.liquido += v.liquido;
    }
  }
  return r;
}

export type Investimento = { investimento: number | null; cpl: number | null; leads: number | null };

/**
 * Líquido por lead da semana x CPL. Leads: o número digitado ou, sem ele, investimento ÷ CPL.
 * alerta = cada lead traz menos do que custa.
 */
export function porLead(liquidoSemana: number, i: Investimento): { leads: number | null; liquidoPorLead: number | null; alerta: boolean } {
  const leads = i.leads ?? (i.investimento != null && i.cpl ? Math.round(i.investimento / i.cpl) : null);
  const liquidoPorLead = leads ? liquidoSemana / leads : null;
  return { leads, liquidoPorLead, alerta: liquidoPorLead != null && i.cpl != null && liquidoPorLead < i.cpl };
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------
export type Coluna = "ideia" | "planejando" | "andamento" | "no_ar" | "pausado";
export const COLUNAS: { id: Coluna; nome: string; cor: string }[] = [
  { id: "ideia", nome: "Ideia", cor: "cinza" },
  { id: "planejando", nome: "Planejando", cor: "roxo" },
  { id: "andamento", nome: "Em andamento", cor: "azul" },
  { id: "no_ar", nome: "No ar", cor: "verde" },
  { id: "pausado", nome: "Pausado", cor: "laranja" },
];
export const ehColuna = (v: unknown): v is Coluna => COLUNAS.some((c) => c.id === v);

/** Posição entre dois cartões (para arrastar sem renumerar a coluna). */
export function ordemEntre(antes: number | undefined, depois: number | undefined): number {
  if (antes === undefined && depois === undefined) return 1000;
  if (antes === undefined) return depois! - 1000;
  if (depois === undefined) return antes + 1000;
  return (antes + depois) / 2;
}

export type StatusFrente = "ideia" | "planejando" | "testando" | "rodando" | "pausado";
export const STATUS_FRENTE: Record<StatusFrente, { nome: string; cor: string }> = {
  ideia: { nome: "Ideia", cor: "cinza" },
  planejando: { nome: "Planejando", cor: "roxo" },
  testando: { nome: "Testando", cor: "azul" },
  rodando: { nome: "Rodando", cor: "verde" },
  pausado: { nome: "Pausado", cor: "laranja" },
};

// ---------------------------------------------------------------------------
// Decisões
// ---------------------------------------------------------------------------
export type StatusDecisao = "pendente" | "decidido" | "revisar";
export const STATUS_DECISAO: { id: StatusDecisao; nome: string; cor: string }[] = [
  { id: "pendente", nome: "Pendente", cor: "laranja" },
  { id: "decidido", nome: "Decidido", cor: "verde" },
  { id: "revisar", nome: "Revisar", cor: "roxo" },
];
export const ehStatusDecisao = (v: unknown): v is StatusDecisao => STATUS_DECISAO.some((s) => s.id === v);

// ---------------------------------------------------------------------------
// formulários
// ---------------------------------------------------------------------------
/** Texto do formulário: sem espaços nas pontas, vazio = null, cortado no limite. */
export function texto(form: FormData, campo: string, limite: number): string | null {
  const v = String(form.get(campo) ?? "").trim();
  return v ? v.slice(0, limite) : null;
}

export function idDoForm(form: FormData, campo: string): number | null {
  const v = String(form.get(campo) ?? "");
  return /^\d+$/.test(v) ? Number(v) : null;
}

export function diaDoForm(form: FormData, campo: string): string | null {
  const v = String(form.get(campo) ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** "1.234,56" ou "1234.56" → 1234.56; vazio ou inválido → null. */
export function numeroDoForm(form: FormData, campo: string): number | null {
  let v = String(form.get(campo) ?? "").trim().replace(/[R$\s]/g, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function urlOk(url: string | null): url is string {
  return !!url && /^https?:\/\/\S+$/i.test(url) && url.length <= 2000;
}
