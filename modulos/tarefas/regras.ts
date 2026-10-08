// Regras das tarefas (sem banco, sem tela).
// "Atrasada" = pendente com prazo antes de hoje, no horário de Brasília.

export type StatusTarefa = "pendente" | "concluida";
export type Filtro = "pendentes" | "atrasadas" | "concluidas";
export type Tarefa = {
  id: number;
  titulo: string;
  prazo: string | null; // "AAAA-MM-DD"
  status: StatusTarefa;
  criado_em: string;
  concluida_em: string | null;
  responsavel: { id: number; nome: string } | null;
  bm: { id: number; nome: string } | null;
  numero: { id: number; final: string; bm: { nome: string } | null } | null;
};

export const FILTROS: { id: Filtro; nome: string }[] = [
  { id: "pendentes", nome: "Pendentes" },
  { id: "atrasadas", nome: "Atrasadas" },
  { id: "concluidas", nome: "Concluídas" },
];

export function lerFiltro(valor: string | string[] | undefined): Filtro {
  return FILTROS.some((f) => f.id === valor) ? (valor as Filtro) : "pendentes";
}

/** Data de hoje em Brasília, no formato do banco ("AAAA-MM-DD"). */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function estaAtrasada(tarefa: Pick<Tarefa, "status" | "prazo">, hoje: string): boolean {
  return tarefa.status === "pendente" && tarefa.prazo !== null && tarefa.prazo < hoje;
}

function doFiltro(tarefa: Tarefa, filtro: Filtro, hoje: string): boolean {
  if (filtro === "concluidas") return tarefa.status === "concluida";
  if (filtro === "atrasadas") return estaAtrasada(tarefa, hoje);
  return tarefa.status === "pendente";
}

export function contarPorFiltro(tarefas: Tarefa[], hoje: string): Record<Filtro, number> {
  return {
    pendentes: tarefas.filter((t) => doFiltro(t, "pendentes", hoje)).length,
    atrasadas: tarefas.filter((t) => doFiltro(t, "atrasadas", hoje)).length,
    concluidas: tarefas.filter((t) => doFiltro(t, "concluidas", hoje)).length,
  };
}

/**
 * Tarefas do filtro, na ordem de leitura: pendentes pelo prazo mais próximo
 * (sem prazo no fim); concluídas da mais recente para a mais antiga.
 */
export function filtrarTarefas(tarefas: Tarefa[], filtro: Filtro, hoje: string): Tarefa[] {
  const lista = tarefas.filter((t) => doFiltro(t, filtro, hoje));
  if (filtro === "concluidas") {
    return lista.sort((a, b) => (b.concluida_em ?? "").localeCompare(a.concluida_em ?? ""));
  }
  return lista.sort((a, b) => {
    if (a.prazo !== b.prazo) {
      if (a.prazo === null) return 1;
      if (b.prazo === null) return -1;
      return a.prazo.localeCompare(b.prazo);
    }
    return a.criado_em.localeCompare(b.criado_em);
  });
}

/** "2026-10-08" -> "08/10"; de outro ano -> "08/10/2027". */
export function formatarData(data: string, hoje: string): string {
  const [ano, mes, dia] = data.split("-");
  return ano === hoje.slice(0, 4) ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}

/** Texto do vínculo: "BM 01" ou "5887 · BM 01". */
export function textoVinculo(tarefa: Pick<Tarefa, "bm" | "numero">): string | null {
  if (tarefa.numero) return [tarefa.numero.final, tarefa.numero.bm?.nome].filter(Boolean).join(" · ");
  return tarefa.bm?.nome ?? null;
}

export type CamposTarefa = {
  titulo: string;
  responsavel_id: number | null;
  prazo: string | null;
  bm_id: number | null;
  numero_id: number | null;
};

/** Lê e confere o formulário de tarefa. O vínculo vem num campo só: "bm:3", "numero:7" ou vazio. */
export function lerCamposTarefa(form: FormData): { campos: CamposTarefa } | { erro: string } {
  const titulo = String(form.get("titulo") ?? "").trim().replace(/\s+/g, " ");
  if (!titulo) return { erro: "Escreva o título da tarefa." };
  if (titulo.length > 200) return { erro: "Título muito longo (máximo 200 caracteres)." };

  const resp = String(form.get("responsavel_id") ?? "");
  const responsavel_id = resp ? Number(resp) : null;
  if (responsavel_id !== null && !(Number.isInteger(responsavel_id) && responsavel_id > 0)) {
    return { erro: "Responsável inválido." };
  }

  const prazoTexto = String(form.get("prazo") ?? "");
  const prazo = prazoTexto || null;
  if (prazo !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(prazo) || Number.isNaN(Date.parse(prazo)))) {
    return { erro: "Prazo inválido." };
  }

  const [tipo, idTexto] = String(form.get("vinculo") ?? "").split(":");
  const idVinculo = Number(idTexto);
  const vinculoOk = Number.isInteger(idVinculo) && idVinculo > 0;
  const bm_id = tipo === "bm" && vinculoOk ? idVinculo : null;
  const numero_id = tipo === "numero" && vinculoOk ? idVinculo : null;

  return { campos: { titulo, responsavel_id, prazo, bm_id, numero_id } };
}

/** Erro do banco em português. */
export function mensagemDoErro(erro: { code?: string } | null): string {
  switch (erro?.code) {
    case "23503":
      return "Responsável, BM ou número não encontrado.";
    case "23514":
      return "Algum campo está fora do formato.";
    case "42501":
      return "Sem permissão para salvar.";
    default:
      return "Não deu para salvar. Tente de novo.";
  }
}
