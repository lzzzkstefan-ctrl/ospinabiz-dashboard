// Papéis de usuário: "admin", "atendente" e "plantonista" (só cobre turnos: Escala, check-in, os
// leads dele no Funil e as tarefas dele; nada de Vendas, Webinários nem Monitor; migration escala).
// O papel fica em app_metadata.papel (o usuário não consegue editar), nunca em user_metadata.
// Funções para checar o papel do usuário logado ficam aqui, num lugar só.
// Obs.: o papel vem do token de login. Se mudar o papel de alguém no Supabase,
// a mudança só vale depois que o token dessa pessoa renovar (ou ela sair e entrar).
//
// Papel em VENDAS (app_metadata.vendas), separado do admin do sistema (migration vendas_papeis):
//   "chefe"    → tudo em Vendas (todas as abas, Geral completa, Configuração, fechar/reabrir mês);
//   "gerente"  → a própria aba + Geral completa (só números) + confirma as próprias vendas pendentes;
//   "vendedor" → a própria aba + Geral da equipe (quantidade e meta, sem valores).
// Sem app_metadata.vendas: admin = chefe; plantonista = nenhum; os outros = vendedor (igual à função
// privado.vendas_papel).

import { createClient } from "@/lib/supabase/server";

export type Papel = "admin" | "atendente" | "plantonista";
export type PapelVendas = "chefe" | "gerente" | "vendedor" | "nenhum";

export type UsuarioLogado = { id: string; papel: Papel | null; vendas: PapelVendas };

/** Quem está logado e o papel dele, ou null se ninguém está logado. */
export async function usuarioLogado(): Promise<UsuarioLogado | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const meta = (claims.app_metadata ?? {}) as { papel?: unknown; vendas?: unknown };
  const papel = meta.papel === "admin" || meta.papel === "atendente" || meta.papel === "plantonista" ? meta.papel : null;
  const vendas: PapelVendas =
    papel === "plantonista"
      ? "nenhum"
      : meta.vendas === "chefe" || meta.vendas === "gerente" || meta.vendas === "vendedor"
        ? meta.vendas
        : papel === "admin"
          ? "chefe"
          : "vendedor";
  return { id: claims.sub, papel, vendas };
}

export async function ehAdmin(): Promise<boolean> {
  return (await usuarioLogado())?.papel === "admin";
}

/** Chefe de Vendas: o único que administra Vendas (Configuração, fechamento, todas as abas). */
export async function ehChefeVendas(): Promise<boolean> {
  return (await usuarioLogado())?.vendas === "chefe";
}
