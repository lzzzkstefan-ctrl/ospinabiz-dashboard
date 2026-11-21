import { usuarioLogado } from "@/lib/auth/papeis";
import { Suspense } from "react";
import { AbasConfiguracoes } from "./_componentes/abas";

// Configurações (21/11/2026): Notificações deste aparelho (todos), Usuários e Diagnóstico das
// notificações (só a gestão; o proxy e cada página conferem de novo).
async function Abas() {
  const u = await usuarioLogado();
  return <AbasConfiguracoes gestao={u?.gestao ?? false} />;
}

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <h1 className="text-[28px] leading-tight">Configurações</h1>
        <Suspense fallback={<AbasConfiguracoes gestao={false} />}>
          <Abas />
        </Suspense>
      </header>
      {children}
    </div>
  );
}
