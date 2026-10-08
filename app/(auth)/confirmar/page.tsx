import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Suspense } from "react";
import { confirmar } from "./acoes";
import { BotaoContinuar } from "./botao";

// Destino do link de convite e de "esqueci a senha". Templates no Supabase:
//   {{ .SiteURL }}/confirmar?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha
//   {{ .SiteURL }}/confirmar?token_hash={{ .TokenHash }}&type=recovery&next=/definir-senha
// A página só mostra o botão; o token é usado no clique (acoes.ts). Assim a prévia de link
// do WhatsApp ou o antivírus do e-mail, que abrem o endereço sozinhos, não gastam o token.

type Params = { token_hash?: string; type?: string; next?: string };

async function Formulario({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const convite = p.type === "invite";
  return (
    <>
      <CardHeader>
        <CardTitle className="text-[24px] text-white">{convite ? "Bem-vindo(a)" : "Criar nova senha"}</CardTitle>
        <CardDescription>
          {convite
            ? "Clique em continuar para ativar seu acesso e criar sua senha."
            : "Clique em continuar para criar sua senha."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={confirmar}>
          <input type="hidden" name="token_hash" value={p.token_hash ?? ""} />
          <input type="hidden" name="type" value={p.type ?? ""} />
          <input type="hidden" name="next" value={p.next ?? "/definir-senha"} />
          <BotaoContinuar />
        </form>
      </CardContent>
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<Params> }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="glass">
          <Suspense>
            <Formulario searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
