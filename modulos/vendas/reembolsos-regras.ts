// Regras puras dos pedidos de reembolso (sem banco): tipos, prazo, lembretes, textos e taxa de
// reversão. Separado de reembolsos.ts para a tela do navegador poder usar sem levar a chave secreta.

export type StatusReembolso = "pendente" | "revertido" | "reembolsado";
export type LinhaReembolso = "gcs" | "viral";

export type Reembolso = {
  id: number;
  refund_id: string;
  id_fatura: string;
  venda_id: number | null;
  vendedor_id: number | null;
  linha: LinhaReembolso | null;
  produto: string | null;
  valor: number | string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  motivo: string | null;
  pago_em: string | null;
  pedido_em: string;
  prazo: string | null;
  auto_aceite: boolean | null;
  status: StatusReembolso;
  hubla_status: string;
  revertido_em: string | null;
  revertido_por: string | null;
  revertido_via: "tela" | "hubla" | null;
  reembolsado_em: string | null;
};

export const COLUNAS_REEMBOLSO =
  "id, refund_id, id_fatura, venda_id, vendedor_id, linha, produto, valor, cliente_nome, cliente_telefone, motivo, pago_em, pedido_em, prazo, auto_aceite, status, hubla_status, revertido_em, revertido_por, revertido_via, reembolsado_em";

const HORA = 3_600_000;
const DIA = 24 * HORA;

export const nomeDaLinha = (l: LinhaReembolso | null) => (l === "viral" ? "Protocolo Viral" : "GCS");

/** Prazo da Hubla = pago em + dias de garantia. Pedido feito depois disso (ou sem data de pagamento) = sem prazo. */
export function prazoDoPedido(pagoEm: string | null, pedidoEm: string, dias: number): string | null {
  if (!pagoEm) return null;
  const prazo = new Date(pagoEm).getTime() + dias * DIA;
  if (Number.isNaN(prazo) || prazo < new Date(pedidoEm).getTime()) return null;
  return new Date(prazo).toISOString();
}

/**
 * Lembretes que já deveriam ter saído para um pedido pendente:
 * - "24h": continua pendente 24h depois do pedido;
 * - "prazo": falta menos de 24h para o prazo (só se o pedido chegou com mais de 24h de folga,
 *   senão o aviso do pedido já disse que era urgente).
 */
export function lembretesDevidos(r: Pick<Reembolso, "status" | "pedido_em" | "prazo">, agora: Date): ("24h" | "prazo")[] {
  if (r.status !== "pendente") return [];
  const t = agora.getTime();
  const pedido = new Date(r.pedido_em).getTime();
  const fora: ("24h" | "prazo")[] = [];
  if (t - pedido >= DIA) fora.push("24h");
  if (r.prazo) {
    const prazo = new Date(r.prazo).getTime();
    if (prazo - pedido > DIA && prazo - t < DIA && prazo > t) fora.push("prazo");
  }
  return fora;
}

/** "sáb 18/10 14:30" no horário de Brasília. */
export function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${dia.replace(".", "").replace(",", "")} ${hora}`;
}

/** "1d 20h", "5h 12min", "8min". */
export function falta(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

export function textoPrazo(prazo: string | null, agora: Date): string {
  if (!prazo) return "sem prazo automático";
  const ms = new Date(prazo).getTime() - agora.getTime();
  return ms > 0 ? `${dataCurta(prazo)} (faltam ${falta(ms)})` : `${dataCurta(prazo)} (venceu)`;
}

const brl = (v: number | string | null) =>
  v == null ? "valor ?" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Corpo do push: "Nome, R$ 297,00, GCS. Prazo: sáb 18/10 14:30 (faltam 1d 20h)". */
export function corpoDoAviso(r: Pick<Reembolso, "cliente_nome" | "valor" | "linha" | "prazo">, agora: Date): string {
  return `${r.cliente_nome ?? "Cliente"}, ${brl(r.valor)}, ${nomeDaLinha(r.linha)}. Prazo: ${textoPrazo(r.prazo, agora)}`;
}

export type TaxaReversao = { chave: string; pedidos: number; revertidos: number; reembolsados: number; pendentes: number; taxa: number | null };

/** Taxa de reversão = revertidos ÷ (revertidos + reembolsados); pendente ainda não conta. */
export function taxasDeReversao<T extends Pick<Reembolso, "status">>(lista: T[], chave: (r: T) => string): TaxaReversao[] {
  const grupos = new Map<string, TaxaReversao>();
  for (const r of lista) {
    const k = chave(r);
    const g = grupos.get(k) ?? { chave: k, pedidos: 0, revertidos: 0, reembolsados: 0, pendentes: 0, taxa: null };
    g.pedidos++;
    if (r.status === "revertido") g.revertidos++;
    else if (r.status === "reembolsado") g.reembolsados++;
    else g.pendentes++;
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, taxa: g.revertidos + g.reembolsados ? g.revertidos / (g.revertidos + g.reembolsados) : null }))
    .sort((a, b) => b.pedidos - a.pedidos || a.chave.localeCompare(b.chave));
}
