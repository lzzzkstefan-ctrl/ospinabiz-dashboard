// Lê o payload do webhook da Hubla (v2, evento de fatura) e tira só o que o
// módulo usa. Sem banco e sem regra de negócio: só tradução do formato.
// Campos conferidos com docs/modulos/vendas-referencia.md (seção 6).

/** pedido_reembolso = cliente pediu (refund_request.created); pedido_reembolso_fim = desistiu ou foi
 * recusado (refund_request.canceled / .rejected). "reembolso" = efetuado (fatura reembolsada ou pedido aceito). */
export type TipoEvento = "pagamento" | "reembolso" | "pedido_reembolso" | "pedido_reembolso_fim" | "outro";

/** Pedido de reembolso (event.refund dos eventos refund_request.*). */
export type PedidoReembolso = { id: string; status: string | null; autoAceite: boolean | null; criadoEm: string | null; motivo: string | null };

/** nome = "<produto> - <oferta>"; produto = nome do produto (o que aparece como bump).
 * produtoId/ofertaId = IDs da Hubla (o Viral é reconhecido por eles, nunca pelo nome). */
export type OfertaHubla = { produto: string | null; nome: string; valorCentavos: number | null; produtoId?: string | null; ofertaId?: string | null };

export type FaturaHubla = {
  tipoBruto: string;
  tipo: TipoEvento;
  idFatura: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  itens: string[];
  /** ofertas principais (isOrderBump = false) */
  principais: OfertaHubla[];
  /** ofertas marcadas como order bump (isOrderBump = true). O Protocolo (ticket) pode vir
   * aqui; o resto nunca conta, só o nome no card (regra A, regras.ts) */
  ofertasBump: OfertaHubla[];
  /** nomes dos order bumps (isOrderBump = true): só para mostrar, nunca contam */
  bumps: string[];
  valorPagoCentavos: number | null; // só referência (subtotal da fatura)
  /** total que o cliente pagou de verdade (com desconto e juros do parcelamento): valor da venda do Viral */
  valorTotalCentavos: number | null;
  /** o que fica para a operação na fatura inteira (com bumps), depois da taxa da Hubla.
   * Receita da dash geral; NUNCA entra na comissão. */
  receitaLiquidaCentavos: number | null;
  pagoEm: string | null; // ISO, instante do status "paid"
  nome: string | null;
  telefone: string | null;
  email: string | null;
  /** só nos eventos refund_request.* */
  pedido: PedidoReembolso | null;
};

const PAGAMENTO = new Set(["invoice.payment_succeeded"]);
const REEMBOLSO = new Set(["invoice.refunded", "refund_request.accepted"]);
const PEDIDO_REEMBOLSO = new Set(["refund_request.created"]);
const PEDIDO_REEMBOLSO_FIM = new Set(["refund_request.canceled", "refund_request.rejected"]);

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function lerFatura(payload: unknown): FaturaHubla {
  const raiz = obj(payload);
  const evento = obj(raiz.event);
  const fatura = obj(evento.invoice);
  const tipoBruto = texto(raiz.type) ?? "desconhecido";

  const utm = obj(obj(fatura.paymentSession).utm);
  const utmPrimeira = obj(obj(fatura.firstPaymentSession).utm);

  // nomes dos itens: "<produto> - <oferta>" (ou só o produto, se não vier oferta)
  // principal x order bump: pela marca isOrderBump de cada oferta
  const itens: string[] = [];
  const principais: OfertaHubla[] = [];
  const ofertasBump: OfertaHubla[] = [];
  const bumps: string[] = [];
  for (const p of lista(evento.products)) {
    const produto = texto(obj(p).name);
    const produtoId = texto(obj(p).id);
    const ofertas = lista(obj(p).offers);
    if (ofertas.length === 0 && produto) {
      itens.push(produto);
      principais.push({ produto, nome: produto, valorCentavos: null, produtoId, ofertaId: null });
    }
    for (const o of ofertas) {
      const oferta = texto(obj(o).name);
      const nome = [produto, oferta].filter(Boolean).join(" - ");
      if (!nome) continue;
      itens.push(nome);
      const item = { produto, nome, valorCentavos: numero(obj(o).amountCents), produtoId, ofertaId: texto(obj(o).id) };
      if (obj(o).isOrderBump === true) {
        bumps.push(produto ?? nome);
        ofertasBump.push(item);
      } else principais.push(item);
    }
  }

  const valor = obj(fatura.amount);
  // recebedor da operação = o que tem o mesmo id do vendedor da fatura (o outro é a plataforma)
  const recebedor = lista(fatura.receivers).map(obj).find((r) => texto(r.id) !== null && r.id === fatura.sellerId);
  const pago = lista(fatura.statusAt).map(obj).find((s) => s.status === "paid");
  // nos eventos de pedido de reembolso o comprador vem em event.user (a fatura traz só o payerId)
  const pagador = Object.keys(obj(fatura.payer)).length ? obj(fatura.payer) : obj(evento.user);
  const nome = [texto(pagador.firstName), texto(pagador.lastName)].filter(Boolean).join(" ") || null;
  const refund = obj(evento.refund);
  const auto = refund.isAutoAccepted;

  return {
    tipoBruto,
    tipo: PAGAMENTO.has(tipoBruto)
      ? "pagamento"
      : REEMBOLSO.has(tipoBruto)
        ? "reembolso"
        : PEDIDO_REEMBOLSO.has(tipoBruto)
          ? "pedido_reembolso"
          : PEDIDO_REEMBOLSO_FIM.has(tipoBruto)
            ? "pedido_reembolso_fim"
            : "outro",
    idFatura: texto(fatura.id),
    utmTerm: texto(utm.term) ?? texto(utmPrimeira.term),
    utmContent: texto(utm.content) ?? texto(utmPrimeira.content),
    itens,
    principais,
    ofertasBump,
    bumps,
    valorPagoCentavos: numero(valor.subtotalCents) ?? numero(valor.totalCents),
    valorTotalCentavos: numero(valor.totalCents) ?? numero(valor.subtotalCents),
    receitaLiquidaCentavos: recebedor ? numero(recebedor.totalCents) : null,
    pagoEm: texto(pago?.when) ?? texto(fatura.saleDate),
    nome,
    telefone: texto(pagador.phone),
    email: texto(pagador.email),
    pedido: texto(refund.id)
      ? {
          id: texto(refund.id)!,
          status: texto(refund.status),
          // a doc da Hubla diz string, os exemplos mandam boolean: aceita os dois
          autoAceite: auto === true || auto === "true" ? true : auto === false || auto === "false" ? false : null,
          criadoEm: texto(refund.createdAt),
          motivo: texto(refund.description),
        }
      : null,
  };
}
