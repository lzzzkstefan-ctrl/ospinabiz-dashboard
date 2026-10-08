import { createClient } from "@/lib/supabase/server";

export async function UsuarioAtual() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;

  if (!email) return null;

  return (
    <span className="max-w-[180px] shrink truncate px-2 text-[12px] text-ink-faint" title={email}>
      {email}
    </span>
  );
}
