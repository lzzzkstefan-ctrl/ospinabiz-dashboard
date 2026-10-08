// Cores das etiquetas de Vendas: UM lugar só. Trocar aqui muda o modal "Nova venda", os
// cards, a tabela, a rosca e o link público.
// - Ticket com cor aqui (pelo valor bruto, em centavos) usa esta cor.
// - Ticket que não está aqui usa a cor salva no banco (tickets.cor, os antigos do Lock in)
//   e, sem ela, a neutra.

/** valor bruto do ticket (centavos) → cor. Uma cor diferente para cada ticket. */
export const CORES_TICKET: Record<number, string> = {
  // tickets atuais
  15800: "#22c55e", // R$ 158: verde
  23800: "#3b82f6", // R$ 238: azul
  27800: "#a855f7", // R$ 278: roxo
  33800: "#f59e0b", // R$ 338: dourado
  // tickets antigos (histórico)
  10000: "#06b6d4", // R$ 100: ciano
  14890: "#f97316", // R$ 148,90: laranja
  16890: "#ec4899", // R$ 168,90: rosa
  18800: "#84cc16", // R$ 188: lima
  19890: "#14b8a6", // R$ 198,90: verde-água
  24890: "#6366f1", // R$ 248,90: anil
  28800: "#d946ef", // R$ 288: magenta
  39890: "#c08457", // R$ 398,90: caramelo
};

/** venda sem ticket porque o principal é produto (combo, Nexus…) */
export const COR_PRODUTO = "#94a3b8";
/** venda sem ticket que precisa de revisão */
export const COR_REVISAR = "#ef4444";
/** ticket sem cor definida */
export const COR_NEUTRA = "#8a96a3";

/** opacidade do fundo do botão selecionado (≈15%), em hexadecimal */
export const FUNDO_SELECIONADO = "26";

export function corDoTicket(valorBrutoCentavos: number, corDoBanco: string | null | undefined): string {
  return CORES_TICKET[valorBrutoCentavos] ?? corDoBanco ?? COR_NEUTRA;
}
