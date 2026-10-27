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

// ---------------------------------------------------------------------------
// Custo de mensagens (WhatsApp API oficial)
// ---------------------------------------------------------------------------

/** A Meta passou a cobrar cada mensagem enviada em 01/10/2026: só lemos mensagens daqui em diante. */
export const INICIO_DO_CUSTO = "2026-10-01T00:00:00Z";

export type TipoMensagem = "texto" | "audio" | "video" | "imagem" | "documento" | "template" | "outro";
export type OrigemMensagem = "automacao" | "atendente" | "celular";
export type EntregaMensagem = "entregue" | "enviada" | "erro";

/** Tipo pela mídia anexada; botões ou cabeçalho = template (ou mensagem com botões). */
export function tipoDaMensagem(m: { attachments?: { type?: string | null }[] | null; buttons?: unknown[] | null; header?: string | null }): TipoMensagem {
  const anexo = (m.attachments?.[0]?.type ?? "").toUpperCase();
  if (anexo === "AUDIO") return "audio";
  if (anexo === "VIDEO") return "video";
  if (anexo === "IMAGE" || anexo === "STICKER") return "imagem";
  if (anexo === "DOCUMENT") return "documento";
  if (anexo) return "outro";
  if (m.buttons?.length || m.header) return "template";
  return "texto";
}

/** Quem mandou: atendente (pessoa no CRM), automação (fluxo com nome) ou celular (nenhum dos dois). */
export function origemDaMensagem(m: { attendant?: { id: string } | null; senderName?: string | null }): OrigemMensagem {
  if (m.attendant?.id) return "atendente";
  if (m.senderName?.trim()) return "automacao";
  return "celular";
}

/** A Meta cobra a mensagem entregue: RECEIVED (entregue) e READ (lida) contam; SENT ainda não chegou. */
export function entregaDaMensagem(status: string | null | undefined): EntregaMensagem {
  const s = (status ?? "").toUpperCase();
  if (s === "RECEIVED" || s === "READ" || s === "DELIVERED" || s === "PLAYED") return "entregue";
  if (s === "ERROR" || s === "FAILED") return "erro";
  return "enviada";
}
