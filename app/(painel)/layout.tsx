import { LogoutButton } from "@/components/logout-button";
import { PainelNav } from "@/components/painel-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UsuarioAtual } from "@/components/usuario-atual";
import { Suspense } from "react";

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b p-4 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Ospinabiz</span>
          <div className="md:hidden">
            <LogoutButton />
          </div>
        </div>
        <PainelNav />
        <div className="mt-auto hidden flex-col gap-2 md:flex">
          <Suspense>
            <UsuarioAtual />
          </Suspense>
          <div className="flex items-center justify-between">
            <LogoutButton />
            <ThemeSwitcher />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
