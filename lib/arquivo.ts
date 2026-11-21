// Abas arquivadas (21/11/2026): a operação do dia a dia passou para o Prime e o app virou a central de
// gestão. As abas antigas continuam abertas em modo leitura em "Arquivado" (nada foi apagado).
// Só leitura em três camadas: a tela esconde os controles (data-arquivado, globals.css), as ações do
// servidor devolvem SO_LEITURA e o banco recusa gravação nas tabelas delas
// (migration 20261121120000_arquivar_abas_operacao). Contexto em docs/modulos/arquivado.md.

export const ARQUIVADO_EM = "2026-11-21";
export const ARQUIVADO_EM_BR = "21/11/2026";

export type AbaArquivada = { href: string; nome: string; descricao: string; tinhaTela: boolean };

export const ABAS_ARQUIVADAS: AbaArquivada[] = [
  { href: "/monitor", nome: "Monitor", descricao: "Testes diários dos números das BMs pela Meta, com aviso no Telegram.", tinhaTela: true },
  { href: "/escala", nome: "Check-in", descricao: "Entrada, pausa e saída da equipe, horários fixos, feriados e alertas de operação.", tinhaTela: true },
  { href: "/bms", nome: "BMs", descricao: "Saúde dos números principais, banimentos e comparação Antes x Agora.", tinhaTela: true },
  { href: "/fechamento", nome: "Fechamento", descricao: "Ficou em \"em breve\": o fechamento de verdade continua dentro de Vendas.", tinhaTela: false },
  { href: "/webinarios", nome: "Webinários (antigo)", descricao: "Sessões, checklists, links e custo de mensagem dos webinários.", tinhaTela: true },
  { href: "/funil", nome: "Funil (antigo)", descricao: "Leads e conversas da Data Crazy: chegada, atendimento, banidos e custo.", tinhaTela: true },
  { href: "/tarefas", nome: "Tarefas", descricao: "Quadro de tarefas da equipe.", tinhaTela: true },
  { href: "/melhorias", nome: "Melhorias", descricao: "Backlog e novidades do app (agora em Projetos).", tinhaTela: true },
];

export function ehAbaArquivada(pathname: string): boolean {
  return ABAS_ARQUIVADAS.some((a) => pathname === a.href || pathname.startsWith(`${a.href}/`));
}

/** O que as ações das abas arquivadas devolvem no lugar de gravar (cabe em EstadoForm). */
export const SO_LEITURA = { erro: `Aba arquivada em ${ARQUIVADO_EM_BR}: só leitura.` } as const;

/**
 * Primeira linha de toda ação das abas arquivadas: `const b = soLeitura(); if (b) return b as never;`.
 * Devolve sempre o aviso (em vez de lançar erro, que derrubaria a tela); fica como função para dar para
 * reabrir uma aba trocando só aqui.
 */
export function soLeitura(): typeof SO_LEITURA | null {
  return SO_LEITURA;
}

/** Rotinas desligadas junto com o arquivamento (mostradas na página Arquivado). */
export const ROTINAS_DESLIGADAS: { nome: string; fazia: string }[] = [
  { nome: "Alertas do Check-in (a cada 2 min)", fazia: "Pausa, volta, atraso na entrada, pausa longa e operação descoberta/coberta, por push e WhatsApp." },
  { nome: "Feriados (de hora em hora)", fazia: "Pergunta da véspera e lembrete das 20h." },
  { nome: "Check-in esquecido (a cada 15 min)", fazia: "Encerrava entradas que ficaram abertas." },
  { nome: "Teste dos números das BMs (manhã e tarde)", fazia: "Mandava a mensagem de teste pela Meta e avisava no Telegram." },
  { nome: "Sincronização da Data Crazy (a cada 15 min)", fazia: "Puxava leads e conversas para o Funil, as BMs e o Início." },
];
