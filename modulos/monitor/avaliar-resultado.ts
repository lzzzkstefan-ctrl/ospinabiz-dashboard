// Regras do resultado de um teste:
// - delivered/read = OK; failed = FALHOU; só sent ou nada no prazo = SEM RESPOSTA;
// - todos os números de uma BM falharam = "BM X caiu" (em vez de listar um por um);
// - todos falharam = "verificar número remetente".

import type {
  NumeroComStatus,
  NumeroMonitorado,
  ResultadoNumero,
  ResultadoTeste,
  StatusMeta,
  Teste,
} from "./tipos";

/** Resultado de um número a partir do último status que a Meta mandou. */
export function resultadoDoStatusMeta(status: StatusMeta | null): ResultadoTeste {
  if (status === "delivered" || status === "read") return "ok";
  if (status === "failed") return "falhou";
  return "sem_resposta";
}

/** Só número com telefone completo pode receber o teste. */
export function podeSerTestado(numero: Pick<NumeroMonitorado, "telefone">): boolean {
  return numero.telefone !== null;
}

/**
 * Status de cada número para a tela:
 * - se o teste mais recente ainda está aberto e inclui o número: "em teste";
 * - senão, o resultado do último teste fechado em que ele entrou;
 * - nunca testado: "sem teste".
 */
export function statusDosNumeros(
  numeros: NumeroMonitorado[],
  testeAberto: Teste | null,
  ultimoFechado: Teste | null,
  resultados: ResultadoNumero[],
): NumeroComStatus[] {
  return numeros.map((n) => {
    const doNumero = resultados.filter((r) => r.numero_id === n.id);
    if (testeAberto && doNumero.some((r) => r.teste_id === testeAberto.id)) {
      return { ...n, status: "em_teste", testadoEm: testeAberto.iniciado_em };
    }
    const fechado = ultimoFechado && doNumero.find((r) => r.teste_id === ultimoFechado.id);
    if (fechado && ultimoFechado) {
      return {
        ...n,
        status: fechado.resultado ?? resultadoDoStatusMeta(fechado.status_meta),
        testadoEm: ultimoFechado.iniciado_em,
      };
    }
    return { ...n, status: "sem_teste", testadoEm: null };
  });
}

export type ResumoTeste = { testados: number; ok: number; problemas: string[] };

/**
 * Resumo do último teste fechado: placar e problemas, já com as regras de BM
 * e de remetente. Considera só os números que entraram nesse teste.
 */
export function resumirTeste(numeros: NumeroComStatus[]): ResumoTeste {
  const testados = numeros.filter((n) => n.status === "ok" || n.status === "falhou" || n.status === "sem_resposta");
  const comProblema = testados.filter((n) => n.status !== "ok");
  const ok = testados.length - comProblema.length;

  if (testados.length > 1 && comProblema.length === testados.length) {
    return { testados: testados.length, ok, problemas: ["Todos falharam: verificar o número remetente"] };
  }

  const problemas: string[] = [];
  const porBm = new Map<number, NumeroComStatus[]>();
  for (const n of comProblema) porBm.set(n.bm.id, [...(porBm.get(n.bm.id) ?? []), n]);

  for (const [bmId, falhas] of porBm) {
    const testadosDaBm = testados.filter((n) => n.bm.id === bmId);
    const finais = falhas.map((n) => n.final).join(", ");
    if (testadosDaBm.length > 1 && falhas.length === testadosDaBm.length) {
      problemas.push(`${falhas[0].bm.nome} caiu (${finais})`);
    } else {
      for (const n of falhas) {
        problemas.push(`${n.final} ${n.bm.nome}: ${n.status === "falhou" ? "falhou" : "sem resposta"}`);
      }
    }
  }

  return { testados: testados.length, ok, problemas };
}
