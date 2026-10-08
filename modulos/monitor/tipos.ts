// Tipos do monitor: número monitorado, teste, resultado por número
// (OK / FALHOU / SEM RESPOSTA). Ver docs/modulos/monitor.md.

export type StatusMeta = "sent" | "delivered" | "read" | "failed";
export type ResultadoTeste = "ok" | "falhou" | "sem_resposta";
export type SituacaoTeste = "enviando" | "aguardando" | "fechado";

/** O que a tela mostra para cada número. */
export type StatusNaTela = ResultadoTeste | "em_teste" | "sem_teste";

/** Número em operação (situação = operação, ativo, BM ativa). */
export type NumeroMonitorado = {
  id: number;
  final: string;
  telefone: string | null;
  bm: { id: number; nome: string };
};

export type Teste = { id: number; iniciado_em: string; situacao: SituacaoTeste };

/** Linha de monitor_resultados de um número num teste. */
export type ResultadoNumero = {
  numero_id: number;
  teste_id: number;
  status_meta: StatusMeta | null;
  resultado: ResultadoTeste | null;
};

/** Número com o status calculado para a tela. */
export type NumeroComStatus = NumeroMonitorado & { status: StatusNaTela; testadoEm: string | null };
