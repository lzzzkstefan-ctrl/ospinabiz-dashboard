// Regras do Funil que não dependem de banco nem de API (fáceis de conferir).
// Contexto em docs/modulos/funil.md.

/** Carga inicial: nada antes disso entra no funil. */
export const INICIO_DO_FUNIL = "2026-09-01T00:00:00-03:00";
/** Leads criados há até 90 dias continuam sendo acompanhados. */
export const DIAS_DE_ACOMPANHAMENTO = 90;

/** Início da janela de acompanhamento: o mais recente entre 01/09/2026 e 90 dias atrás. */
export function inicioDaJanela(agora = Date.now()): Date {
  const noventaDias = agora - DIAS_DE_ACOMPANHAMENTO * 86_400_000;
  return new Date(Math.max(noventaDias, Date.parse(INICIO_DO_FUNIL)));
}

/** Dia (AAAA-MM-DD) em Brasília. America/Sao_Paulo = UTC-3, sem horário de verão desde 2019. */
export function diaSP(iso: string): string {
  return new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Nome de etiqueta para comparar: a Data Crazy às vezes deixa espaços nas pontas. */
export function nomeDaEtiqueta(nome: string): string {
  return nome.replace(/\s+/g, " ").trim();
}

export function soDigitos(texto: string | null | undefined): string | null {
  const d = (texto ?? "").replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/**
 * Chave para cruzar telefone do lead com o do comprador: os 8 últimos dígitos.
 * Assim o mesmo celular bate com ou sem 55, DDD ou o 9 da frente.
 */
export function chaveTelefone(telefone: string | null | undefined): string | null {
  const d = soDigitos(telefone);
  return d ? d.slice(-8) : null;
}

/** Mesmo conjunto de etiquetas (a ordem não importa). */
export function mesmasEtiquetas(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export type Compra = "hubla" | "fora_hubla" | "a_conferir" | null;

/**
 * Comprou?
 * - achou venda paga na Hubla pelo telefone → "hubla"
 * - etiqueta de pagamento fora da Hubla (Pix/CNPJ) → "fora_hubla"
 * - etiqueta da etapa de compra (Aluno) sem venda achada → "a_conferir"
 */
export function decidirCompra(p: { temVenda: boolean; etiquetaForaHubla: boolean; etiquetaDeCompra: boolean }): Compra {
  if (p.temVenda) return "hubla";
  if (p.etiquetaForaHubla) return "fora_hubla";
  if (p.etiquetaDeCompra) return "a_conferir";
  return null;
}

/** GSC ou Viral: algum item da venda contém o texto cadastrado (sem diferenciar maiúscula). */
export function downsellDosItens(
  itens: string[],
  produtos: { texto: string; tipo: "gsc" | "viral" }[],
): "gsc" | "viral" | null {
  const baixos = itens.map((i) => i.toLowerCase());
  for (const p of produtos) {
    const t = p.texto.toLowerCase();
    if (baixos.some((i) => i.includes(t))) return p.tipo;
  }
  return null;
}
