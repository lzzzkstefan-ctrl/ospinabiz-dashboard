// Formatação usada no servidor (o base.tsx é do navegador).
export const formatBRLServidor = (c: number) =>
  `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
