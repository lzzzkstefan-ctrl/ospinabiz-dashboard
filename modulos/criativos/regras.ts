// Regras da aba Criativos (fase 1, 26/11/2026). Sem tela, sem banco: pode ser usado no navegador.
// Contexto em docs/modulos/criativos.md.

export type Status = "ideia" | "roteiro" | "gravar" | "gravado" | "no_ar" | "venceu" | "perdeu";
export type Origem = "ideia_propria" | "variacao" | "referencia" | "organico";
export type Modo = "variacoes" | "ideias" | "roteiro" | "organico" | "analise_referencia" | "separar";
export type Cor = "verde" | "roxo" | "azul" | "laranja" | "vermelho" | "cinza";

/** Ordem do funil de produção: ideia → roteiro → gravar → gravado → no ar → venceu/perdeu. */
export const STATUS: { id: Status; nome: string; cor: Cor }[] = [
  { id: "ideia", nome: "Ideia", cor: "cinza" },
  { id: "roteiro", nome: "Roteiro", cor: "roxo" },
  { id: "gravar", nome: "Gravar", cor: "laranja" },
  { id: "gravado", nome: "Gravado", cor: "azul" },
  { id: "no_ar", nome: "No ar", cor: "verde" },
  { id: "venceu", nome: "Venceu", cor: "verde" },
  { id: "perdeu", nome: "Perdeu", cor: "vermelho" },
];
export const ehStatus = (v: unknown): v is Status => STATUS.some((s) => s.id === v);
export const nomeStatus = (s: Status) => STATUS.find((x) => x.id === s)!.nome;

export const ORIGENS: { id: Origem; nome: string }[] = [
  { id: "ideia_propria", nome: "Ideia própria" },
  { id: "variacao", nome: "Variação" },
  { id: "referencia", nome: "Referência" },
  { id: "organico", nome: "Orgânico" },
];
export const ehOrigem = (v: unknown): v is Origem => ORIGENS.some((o) => o.id === v);
export const nomeOrigem = (o: Origem) => ORIGENS.find((x) => x.id === o)!.nome;

export const MODOS: Record<Modo, string> = {
  variacoes: "Variações",
  ideias: "Ideias",
  roteiro: "Roteiro completo",
  organico: "Versão orgânica",
  analise_referencia: "Análise de referência",
  separar: "Separar campeão",
};
export const ehModo = (v: unknown): v is Modo => typeof v === "string" && v in MODOS;

// ---------------------------------------------------------------------------
// Gasto
// ---------------------------------------------------------------------------
export const LIMITE_PADRAO_BRL = 100;
/**
 * Cotação usada só pra estimar o custo em reais (a Anthropic cobra em dólar). Conservadora de propósito:
 * melhor o painel mostrar um pouco a mais do que a fatura. Ajustável por CRIATIVOS_COTACAO_DOLAR.
 */
export const COTACAO_PADRAO = 6;

/** Número positivo de uma variável de ambiente, ou o padrão. Aceita vírgula ("5,40"). */
export function numeroDaEnv(valor: string | undefined, padrao: number): number {
  const n = Number(String(valor ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

export type Gasto = { usado: number; limite: number; estourou: boolean };

export function situacaoGasto(usado: number, limite: number): Gasto {
  return { usado, limite, estourou: usado >= limite };
}

export const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Primeiro instante do mês atual no horário de Brasília (UTC-3, sem horário de verão), em ISO. */
export function inicioDoMesSP(agora = new Date()): string {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(agora).split("-");
  return `${ano}-${mes}-01T00:00:00-03:00`;
}

/** "26/11 14:05" no horário de Brasília. */
export function dataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------
/** Texto do formulário sem espaços nas pontas, cortado no máximo; vazio vira null. */
export function textoForm(form: FormData, nome: string, max: number): string | null {
  const v = String(form.get(nome) ?? "").trim();
  return v ? v.slice(0, max) : null;
}

export function idForm(form: FormData, nome: string): number | null {
  const v = String(form.get(nome) ?? "").trim();
  return /^\d+$/.test(v) ? Number(v) : null;
}

export const linkOk = (v: string | null) => !v || (/^https?:\/\/\S+$/.test(v) && v.length <= 2000);
