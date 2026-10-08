import { PainelNav, PainelNavMobile } from "@/components/painel-nav";
import { UsuarioAtual } from "@/components/usuario-atual";
import { Suspense } from "react";

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PainelNav
        usuario={
          <Suspense>
            <UsuarioAtual />
          </Suspense>
        }
      />
      <main className="mx-auto max-w-[1180px] px-6 pb-28 pt-8 md:pb-16 md:pt-24">{children}</main>
      <PainelNavMobile />
    </>
  );
}
