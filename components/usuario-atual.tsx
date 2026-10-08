import { createClient } from "@/lib/supabase/server";

export async function UsuarioAtual() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;

  if (!email) return null;

  return (
    <p className="truncate text-xs text-muted-foreground" title={email}>
      {email}
    </p>
  );
}
