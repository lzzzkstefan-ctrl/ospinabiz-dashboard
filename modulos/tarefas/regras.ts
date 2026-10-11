// Regras das tarefas (sem banco, sem tela). Kanban em 4 colunas.
// "Atrasada" = fora de Feito e já passou do prazo (data + hora; sem hora vale o dia inteiro),
// no horário de Brasília.

export type StatusTarefa = "a_fazer" | "fazendo" | "travado" | "feito";
export type Prioridade = "alta" | "media" | "baixa";
export type Pessoa = { id: number; nome: string };
export type Tarefa = {
  id: number;
  titulo: string;
  descricao: string | null;
  status: StatusTarefa;
  prioridade: Prioridade;
  area: string | null;
  prazo: string | null; // "AAAA-MM-DD"
  prazo_hora: string | null; // "HH:MM:SS"
  ordem: number;
  criado_em: string;
  concluida_em: string | null;
  responsavel: Pessoa | null; // nome = apelido da equipe (ou o nome)
  bm: { id: number; nome: string } | null;
  numero: { id: number; final: string; bm: { nome: string } | null } | null;
  webinario: { id: number; nome: string } | null;
};

export const COLUNAS: { id: StatusTarefa; nome: string; cor: string }[] = [
  { id: "a_fazer", nome: "A fazer", cor: "cinza" },
  { id: "fazendo", nome: "Fazendo", cor: "azul" },
  { id: "travado", nome: "Travado", cor: "laranja" },
  { id: "feito", nome: "Feito", cor: "verde" },
];

export const PRIORIDADES: { id: Prioridade; nome: string }[] = [
  { id: "alta", nome: "Alta" },
  { id: "media", nome: "Média" },
  { id: "baixa", nome: "Baixa" },
];

export const AREAS = ["Operação", "BMs", "Funil", "Vendas", "Webinários", "Dashboard"] as const;

/** Cor fixa da bolinha de cada pessoa (token --tag-*); quem não está aqui fica cinza. */
const COR_PESSOA: Record<string, string> = { Davi: "azul", Rodrigo: "roxo", Vy: "rosa" };
export const corDaPessoa = (nome: string | undefined) => (nome && COR_PESSOA[nome]) || "cinza";

export const ehStatus = (v: unknown): v is StatusTarefa => COLUNAS.some((c) => c.id === v);
const ehPrioridade = (v: unknown): v is Prioridade => PRIORIDADES.some((p) => p.id === v);

/** Data de hoje em Brasília, no formato do banco ("AAAA-MM-DD"). */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Agora em Brasília: "AAAA-MM-DD HH:MM" (dá para comparar como texto). */
export function agoraEmSaoPaulo(agora: Date = new Date()): string {
  const hora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora);
  return `${hojeEmSaoPaulo(agora)} ${hora}`;
}

/** Atrasada: fora de Feito e o prazo já passou. Sem hora, o prazo vai até o fim do dia. */
export function estaAtrasada(t: Pick<Tarefa, "status" | "prazo" | "prazo_hora">, agora: string): boolean {
  if (t.status === "feito" || !t.prazo) return false;
  return `${t.prazo} ${t.prazo_hora?.slice(0, 5) ?? "24:00"}` < agora;
}

/** Números do topo: feitas de quantas, fazendo, travadas, atrasadas. */
export function resumir(tarefas: Tarefa[], agora: string) {
  const conta = (s: StatusTarefa) => tarefas.filter((t) => t.status === s).length;
  const feitas = conta("feito");
  return {
    total: tarefas.length,
    feitas,
    pendentes: tarefas.length - feitas,
    fazendo: conta("fazendo"),
    travadas: conta("travado"),
    atrasadas: tarefas.filter((t) => estaAtrasada(t, agora)).length,
  };
}

/**
 * Ordem de quem cai entre dois cartões: o meio dos dois (só o cartão movido é gravado).
 * Sem vizinho de um lado, anda 1000 para aquele lado.
 */
export function ordemEntre(antes: number | undefined, depois: number | undefined): number {
  if (antes === undefined && depois === undefined) return 1000;
  if (antes === undefined) return depois! - 1000;
  if (depois === undefined) return antes + 1000;
  return (antes + depois) / 2;
}

/** "2026-10-08" -> "08/10"; de outro ano -> "08/10/2027". Com hora: "08/10 19:30". */
export function formatarData(data: string, hoje: string, hora?: string | null): string {
  const [ano, mes, dia] = data.split("-");
  const d = ano === hoje.slice(0, 4) ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
  return hora ? `${d} ${hora.slice(0, 5)}` : d;
}

/** Texto do vínculo: "BM 01", "1234 · BM 01" ou o nome do webinário. */
export function textoVinculo(tarefa: Pick<Tarefa, "bm" | "numero" | "webinario">): string | null {
  if (tarefa.numero) return [tarefa.numero.final, tarefa.numero.bm?.nome].filter(Boolean).join(" · ");
  return tarefa.bm?.nome ?? tarefa.webinario?.nome ?? null;
}

export type CamposTarefa = {
  titulo: string;
  descricao: string | null;
  prioridade: Prioridade;
  area: string | null;
  responsavel_id: number | null;
  prazo: string | null;
  prazo_hora: string | null;
  bm_id?: number | null;
  numero_id?: number | null;
};

/** Lê o id do responsável ("" = ninguém). undefined = inválido. */
export function lerResponsavel(valor: unknown): number | null | undefined {
  const texto = String(valor ?? "");
  if (!texto) return null;
  const id = Number(texto);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Lê e confere o formulário de tarefa. O vínculo vem num campo só: "bm:3", "numero:7" ou vazio;
 * sem o campo (tarefa de webinário), o vínculo não muda.
 */
export function lerCamposTarefa(form: FormData): { campos: CamposTarefa } | { erro: string } {
  const titulo = String(form.get("titulo") ?? "").trim().replace(/\s+/g, " ");
  if (!titulo) return { erro: "Escreva o título da tarefa." };
  if (titulo.length > 200) return { erro: "Título muito longo (máximo 200 caracteres)." };

  const descricao = String(form.get("descricao") ?? "").trim() || null;
  if (descricao && descricao.length > 2000) return { erro: "Descrição muito longa (máximo 2000 caracteres)." };

  const prioridade = form.get("prioridade") ?? "media";
  if (!ehPrioridade(prioridade)) return { erro: "Prioridade inválida." };

  const area = String(form.get("area") ?? "") || null;
  if (area !== null && !(AREAS as readonly string[]).includes(area)) return { erro: "Escolha uma área da lista." };

  const responsavel_id = lerResponsavel(form.get("responsavel_id"));
  if (responsavel_id === undefined) return { erro: "Responsável inválido." };

  const prazo = String(form.get("prazo") ?? "") || null;
  if (prazo !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(prazo) || Number.isNaN(Date.parse(prazo)))) {
    return { erro: "Prazo inválido." };
  }
  const prazo_hora = String(form.get("prazo_hora") ?? "") || null;
  if (prazo_hora !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(prazo_hora)) return { erro: "Horário inválido." };
  if (prazo_hora && !prazo) return { erro: "Para pôr horário, escolha também a data." };

  const campos: CamposTarefa = { titulo, descricao, prioridade, area, responsavel_id, prazo, prazo_hora };
  if (form.has("vinculo")) {
    const [tipo, idTexto] = String(form.get("vinculo") ?? "").split(":");
    const idVinculo = Number(idTexto);
    const ok = Number.isInteger(idVinculo) && idVinculo > 0;
    campos.bm_id = tipo === "bm" && ok ? idVinculo : null;
    campos.numero_id = tipo === "numero" && ok ? idVinculo : null;
  }
  return { campos };
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
