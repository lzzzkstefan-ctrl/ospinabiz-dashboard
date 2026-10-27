// Contas da tela "Custo por funil" (custo por automação). Sem banco nem API.
// Regras em docs/modulos/funil.md ("Custo por automação").
//
// Quem mandou cada mensagem vem da Data Crazy: automação = nome do fluxo (senderName; a API não manda o
// id), manual = atendente. Sem fluxo e sem atendente (envio pelo app no celular), a linha é ESTIMADA
// pela etapa do lead naquele momento.

import { NOME_DO_GRUPO, type GrupoCusto } from "./custo-calculo";

/** Uma linha da visão funil_custo_fluxo. */
export type LinhaFluxo = {
  dia: string;
  origem: string;
  fluxo: string;
  atendente_dc_id: string | null;
  lead_dc_id: string | null;
  etapa_custo: string;
  cobranca: string;
  interno: boolean;
  mensagens: number;
};

export type TipoLinha = "automacao" | "manual" | "estimado";

export type CustoDoFluxo = {
  /** chave estável para o link (automacao:<nome>, manual:<atendente>, estimado:<etapa>) */
  chave: string;
  tipo: TipoLinha;
  nome: string;
  mensagens: number;
  cobradas: number;
  leads: number;
  porLead: number | null;
  custo: number;
  custoPorLead: number | null;
  /** leads que passaram por ela e compraram (a qualquer momento) */
  compraram: number;
  /** custo das mensagens para leads que nunca compraram */
  custoSemCompra: number;
};

export function chaveDaLinha(l: Pick<LinhaFluxo, "origem" | "fluxo" | "atendente_dc_id" | "etapa_custo">): { chave: string; tipo: TipoLinha } {
  if (l.origem === "automacao" && l.fluxo) return { chave: `automacao:${l.fluxo}`, tipo: "automacao" };
  if (l.origem === "atendente") return { chave: `manual:${l.atendente_dc_id ?? "?"}`, tipo: "manual" };
  return { chave: `estimado:${l.etapa_custo}`, tipo: "estimado" };
}

export function nomeDaChave(chave: string, atendentes: Map<string, string>): string {
  const [tipo, ...resto] = chave.split(":");
  const valor = resto.join(":");
  if (tipo === "automacao") return valor;
  if (tipo === "manual") return atendentes.get(valor) ?? "atendente sem nome";
  return `Estimado: ${NOME_DO_GRUPO[valor as GrupoCusto] ?? valor}`;
}

/**
 * Uma linha por automação, por atendente (manual) e por etapa (estimado), da mais cara para a mais barata.
 * `comprou(lead)` diz se o lead comprou (a qualquer momento). Lead interno (teste) fica fora.
 */
export function custoPorFluxo(linhas: LinhaFluxo[], preco: number, comprou: (leadId: string) => boolean, atendentes: Map<string, string>): CustoDoFluxo[] {
  const grupos = new Map<string, { tipo: TipoLinha; mensagens: number; cobradas: number; leads: Set<string>; cobradasSemCompra: number }>();
  for (const l of linhas) {
    if (l.interno) continue;
    const { chave, tipo } = chaveDaLinha(l);
    const g = grupos.get(chave) ?? { tipo, mensagens: 0, cobradas: 0, leads: new Set<string>(), cobradasSemCompra: 0 };
    const cobradas = l.cobranca === "cobrada" ? l.mensagens : 0;
    g.mensagens += l.mensagens;
    g.cobradas += cobradas;
    if (l.lead_dc_id) g.leads.add(l.lead_dc_id);
    if (!l.lead_dc_id || !comprou(l.lead_dc_id)) g.cobradasSemCompra += cobradas;
    grupos.set(chave, g);
  }
  return [...grupos.entries()]
    .map(([chave, g]) => {
      const custo = g.cobradas * preco;
      return {
        chave,
        tipo: g.tipo,
        nome: nomeDaChave(chave, atendentes),
        mensagens: g.mensagens,
        cobradas: g.cobradas,
        leads: g.leads.size,
        porLead: g.leads.size ? g.mensagens / g.leads.size : null,
        custo,
        custoPorLead: g.leads.size ? custo / g.leads.size : null,
        compraram: [...g.leads].filter(comprou).length,
        custoSemCompra: g.cobradasSemCompra * preco,
      };
    })
    .sort((a, b) => b.custo - a.custo || b.mensagens - a.mensagens);
}

/** Custo por dia de uma chave (todos os dias do período, com zero onde não houve envio). */
export function custoPorDia(linhas: LinhaFluxo[], chave: string, preco: number, dias: string[]): { dia: string; mensagens: number; custo: number }[] {
  const porDia = new Map(dias.map((d) => [d, { dia: d, mensagens: 0, custo: 0 }]));
  for (const l of linhas) {
    if (l.interno || chaveDaLinha(l).chave !== chave) continue;
    const d = porDia.get(l.dia);
    if (!d) continue;
    d.mensagens += l.mensagens;
    if (l.cobranca === "cobrada") d.custo += l.mensagens * preco;
  }
  return [...porDia.values()];
}

/** Nome de fluxo para comparar (sem emoji, espaços e maiúsculas): "🦕 PARTE 1 TOPO" ≈ "parte 1 topo". */
export function nomeComparavel(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}$,.]+/gu, " ")
    .trim()
    .toLowerCase();
}
