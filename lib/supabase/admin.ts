// Cliente do Supabase com a chave secreta (SUPABASE_SECRET_KEY). Ignora RLS.
// SÓ no servidor: rotas de app/api e ações que já conferiram quem está pedindo.
// Nunca importar em componente "use client".

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY no servidor.");

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
