"use server";

import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

const TIPOS: EmailOtpType[] = ["invite", "recovery", "signup", "email", "email_change", "magiclink"];

// Só aqui o token é usado (verifyOtp), e só quando a pessoa clica em "Continuar".
// Abrir o link (GET) não consome nada: a prévia do WhatsApp/e-mail não queima o token.
export async function confirmar(formData: FormData) {
  const token_hash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const nextParam = String(formData.get("next") ?? "/");
  // Só aceita caminho interno, pra o link não virar redirecionamento pra fora.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (!token_hash || !TIPOS.includes(type)) {
    redirect(`/erro?error=${encodeURIComponent("Link inválido ou incompleto")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) redirect(`/erro?error=${encodeURIComponent(error.message)}`);
  redirect(next);
}
