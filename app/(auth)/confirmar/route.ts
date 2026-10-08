import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

// Destino do link dos e-mails de convite e de recuperacao de senha.
// Templates no Supabase devem apontar pra:
//   {{ .SiteURL }}/confirmar?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha
//   {{ .SiteURL }}/confirmar?token_hash={{ .TokenHash }}&type=recovery&next=/definir-senha
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/";
  // So aceita caminho interno, pra o link nao virar redirecionamento pra fora.
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      redirect(next);
    } else {
      redirect(`/erro?error=${encodeURIComponent(error.message)}`);
    }
  }

  redirect(`/erro?error=${encodeURIComponent("Link invalido ou incompleto")}`);
}
