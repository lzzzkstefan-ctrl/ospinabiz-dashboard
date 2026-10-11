// Melhorias: backlog e novidades da dashboard. Sem banco e sem tela. Contexto em docs/modulos/melhorias.md.

export const STATUS = [
  { id: "ideia", nome: "Ideia" },
  { id: "fazer", nome: "Para fazer" },
  { id: "andamento", nome: "Em andamento" },
  { id: "feito", nome: "Feito" },
] as const;
export type Status = (typeof STATUS)[number]["id"];

export const PRIORIDADES = [
  { id: "alta", nome: "Alta" },
  { id: "media", nome: "Média" },
  { id: "baixa", nome: "Baixa" },
] as const;
export type Prioridade = (typeof PRIORIDADES)[number]["id"];

/** Abas do menu (mais "Outra") para dizer onde a melhoria mexe. */
export const ABAS = ["Início", "Monitor", "Tarefas", "Vendas", "Funil", "Check-in", "Webinários", "Fechamento", "BMs", "Usuários", "Melhorias", "Outra"] as const;

export type Melhoria = {
  id: number;
  titulo: string;
  descricao: string | null;
  status: Status;
  prioridade: Prioridade;
  aba: string | null;
  sugeridoNome: string | null;
  feitoEm: string | null;
  novidade: string | null;
  criadoEm: string;
};

export const ehStatus = (s: unknown): s is Status => STATUS.some((x) => x.id === s);
export const ehPrioridade = (p: unknown): p is Prioridade => PRIORIDADES.some((x) => x.id === p);
export const nomeStatus = (s: Status) => STATUS.find((x) => x.id === s)!.nome;
export const nomePrioridade = (p: Prioridade) => PRIORIDADES.find((x) => x.id === p)!.nome;

const PESO: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };

/** Dentro de cada coluna: prioridade (alta primeiro), depois a mais antiga. Feito: a mais recente primeiro. */
export function ordenar(itens: Melhoria[]): Melhoria[] {
  return [...itens].sort((a, b) => {
    if (a.status === "feito" && b.status === "feito") return (b.feitoEm ?? "").localeCompare(a.feitoEm ?? "");
    return PESO[a.prioridade] - PESO[b.prioridade] || a.criadoEm.localeCompare(b.criadoEm);
  });
}

/** Confere título, descrição e aba vindos de um formulário. Devolve o erro ou os campos limpos. */
export function lerCampos(form: FormData): { erro: string } | { titulo: string; descricao: string | null; aba: string | null } {
  const titulo = String(form.get("titulo") ?? "").trim();
  const descricao = String(form.get("descricao") ?? "").trim();
  const aba = String(form.get("aba") ?? "").trim();
  if (titulo.length < 3) return { erro: "Escreva um título (pelo menos 3 letras)." };
  if (titulo.length > 120) return { erro: "Título com no máximo 120 letras." };
  if (descricao.length > 2000) return { erro: "Descrição com no máximo 2000 letras." };
  if (aba && !(ABAS as readonly string[]).includes(aba)) return { erro: "Escolha uma aba da lista." };
  return { titulo, descricao: descricao || null, aba: aba || null };
}

/** Data AAAA-MM-DD (Brasília) de um instante. */
export const diaSP = (iso: string) => new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10);
