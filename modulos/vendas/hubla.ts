// Lê o payload do webhook da Hubla (v2, evento de fatura) e tira só o que o
// módulo usa. Sem banco e sem regra de negócio: só tradução do formato.
// Campos conferidos com docs/modulos/vendas-referencia.md (seção 6).

export type TipoEvento = "pagamento" | "reembolso" | "outro";

/** nome = "<produto> - <oferta>"; produto = nome do produto (o que aparece como bump) */
export type OfertaHubla = { produto: string | null; nome: string; valorCentavos: number | null };

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
  valorPagoCentavos: number | null; // só referência
  pagoEm: string | null; // ISO, instante do status "paid"
  nome: string | null;
  telefone: string | null;
  email: string | null;
};

const PAGAMENTO = new Set(["invoice.payment_succeeded"]);
const REEMBOLSO = new Set(["invoice.refunded", "refund_request.accepted"]);

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
    const ofertas = lista(obj(p).offers);
    if (ofertas.length === 0 && produto) {
      itens.push(produto);
      principais.push({ produto, nome: produto, valorCentavos: null });
    }
    for (const o of ofertas) {
      const oferta = texto(obj(o).name);
      const nome = [produto, oferta].filter(Boolean).join(" - ");
      if (!nome) continue;
      itens.push(nome);
      const item = { produto, nome, valorCentavos: numero(obj(o).amountCents) };
      if (obj(o).isOrderBump === true) {
        bumps.push(produto ?? nome);
        ofertasBump.push(item);
      } else principais.push(item);
    }
  }

  const valor = obj(fatura.amount);
  const pago = lista(fatura.statusAt).map(obj).find((s) => s.status === "paid");
  const pagador = obj(fatura.payer);
  const nome = [texto(pagador.firstName), texto(pagador.lastName)].filter(Boolean).join(" ") || null;

  return {
    tipoBruto,
    tipo: PAGAMENTO.has(tipoBruto) ? "pagamento" : REEMBOLSO.has(tipoBruto) ? "reembolso" : "outro",
    idFatura: texto(fatura.id),
    utmTerm: texto(utm.term) ?? texto(utmPrimeira.term),
    utmContent: texto(utm.content) ?? texto(utmPrimeira.content),
    itens,
    principais,
    ofertasBump,
    bumps,
    valorPagoCentavos: numero(valor.subtotalCents) ?? numero(valor.totalCents),
    pagoEm: texto(pago?.when) ?? texto(fatura.saleDate),
    nome,
    telefone: texto(pagador.phone),
    email: texto(pagador.email),
  };
}
