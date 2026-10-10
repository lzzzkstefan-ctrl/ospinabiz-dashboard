// Regras da aba Usuários (sem tela, sem banco). Contexto em docs/modulos/usuarios.md.
// Um papel só na tela; por dentro ele vira o papel do sistema (app_metadata.papel) + o de Vendas
// (app_metadata.vendas), que é o que as regras do banco usam.

export type PapelUsuario = "chefe" | "gerente" | "vendedor" | "plantonista";

export const PAPEIS: { id: PapelUsuario; nome: string; descricao: string }[] = [
  { id: "chefe", nome: "Chefe", descricao: "Tudo; fecha e reabre mês; Configuração de Vendas" },
  { id: "gerente", nome: "Gerente", descricao: "Tudo do sistema; em Vendas, a própria aba + Geral completa" },
  { id: "vendedor", nome: "Vendedor", descricao: "A própria aba de Vendas, os seus leads no Funil, Tarefas, Check-in, Webinários" },
  { id: "plantonista", nome: "Plantonista", descricao: "Só Check-in, os seus leads no Funil e as suas tarefas; nada de Vendas" },
];

/** papel da tela → o que vai em app_metadata */
export function metadataDo(papel: PapelUsuario): { papel: "admin" | "atendente" | "plantonista"; vendas: "chefe" | "gerente" | "vendedor" | "nenhum" } {
  if (papel === "chefe") return { papel: "admin", vendas: "chefe" };
  if (papel === "gerente") return { papel: "admin", vendas: "gerente" };
  if (papel === "vendedor") return { papel: "atendente", vendas: "vendedor" };
  return { papel: "plantonista", vendas: "nenhum" };
}

/** app_metadata → papel da tela (mesma regra de lib/auth/papeis.ts: admin sem "vendas" = chefe) */
export function papelDo(meta: object | null | undefined): PapelUsuario | null {
  const m = (meta ?? {}) as { papel?: unknown; vendas?: unknown };
  const papel = m.papel;
  const vendas = m.vendas;
  if (papel === "plantonista") return "plantonista";
  if (papel === "admin") return vendas === "gerente" ? "gerente" : vendas === "vendedor" ? "vendedor" : "chefe";
  if (papel === "atendente") return vendas === "chefe" ? "chefe" : vendas === "gerente" ? "gerente" : "vendedor";
  return null;
}

export type Status = "pendente" | "ativo" | "desativado";

export function statusDo(u: { banned_until?: string | null; last_sign_in_at?: string | null }, agora = Date.now()): Status {
  if (u.banned_until && Date.parse(u.banned_until) > agora) return "desativado";
  return u.last_sign_in_at ? "ativo" : "pendente";
}

export const NOME_STATUS: Record<Status, string> = { pendente: "Convite pendente", ativo: "Ativo", desativado: "Desativado" };

/**
 * Quem pode mexer em quem (chamado antes de cada ação no servidor).
 * - só chefe e gerente gerenciam;
 * - só o chefe mexe em quem é chefe ou vai virar chefe;
 * - ninguém desativa a si mesmo nem troca o próprio papel;
 * - sempre fica pelo menos um chefe ativo.
 * Devolve null (pode) ou o motivo (não pode).
 */
export function podeMudar(o: {
  quem: PapelUsuario | null;
  quemId: string;
  alvoId: string | null;
  alvoPapel: PapelUsuario | null;
  novoPapel?: PapelUsuario | null;
  acao: "convidar" | "papel" | "ligacoes" | "desativar" | "reativar" | "novo_link";
  chefesAtivos: number;
}): string | null {
  if (o.quem !== "chefe" && o.quem !== "gerente") return "Só o chefe e o gerente gerenciam usuários.";
  const mexeEmChefe = o.alvoPapel === "chefe" || o.novoPapel === "chefe";
  if (mexeEmChefe && o.quem !== "chefe") return "Só o chefe cria ou altera outro chefe.";
  const ehEu = o.alvoId !== null && o.alvoId === o.quemId;
  if (ehEu && (o.acao === "desativar" || (o.acao === "papel" && o.novoPapel !== o.alvoPapel))) {
    return o.acao === "desativar" ? "Você não pode desativar a si mesmo." : "Você não pode trocar o próprio papel.";
  }
  const tiraChefe = o.alvoPapel === "chefe" && (o.acao === "desativar" || (o.acao === "papel" && o.novoPapel !== "chefe"));
  if (tiraChefe && o.chefesAtivos <= 1) return "Tem que ficar pelo menos um chefe ativo.";
  return null;
}

export const utmOk = (u: string) => /^[a-z0-9_-]{1,40}$/.test(u);
export const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
