// Papéis de usuário: "admin" e "atendente".
// O papel fica em app_metadata.papel (o usuário não consegue editar), nunca em user_metadata.
// Funções para checar o papel do usuário logado ficam aqui, num lugar só.
// Obs.: o papel vem do token de login. Se mudar o papel de alguém no Supabase,
// a mudança só vale depois que o token dessa pessoa renovar (ou ela sair e entrar).

import { createClient } from "@/lib/supabase/server";

export type Papel = "admin" | "atendente";

export type UsuarioLogado = { id: string; papel: Papel | null };

/** Quem está logado e o papel dele, ou null se ninguém está logado. */
export async function usuarioLogado(): Promise<UsuarioLogado | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const papel = (claims.app_metadata as { papel?: unknown } | undefined)?.papel;
  return {
    id: claims.sub,
    papel: papel === "admin" || papel === "atendente" ? papel : null,
  };
}

export async function ehAdmin(): Promise<boolean> {
  return (await usuarioLogado())?.papel === "admin";
}
