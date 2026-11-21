"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/configuracoes", nome: "Notificações", gestao: false },
  { href: "/configuracoes/usuarios", nome: "Usuários", gestao: true },
  { href: "/configuracoes/diagnostico", nome: "Diagnóstico", gestao: true },
];

/** Abas de Configurações, no mesmo desenho de pílula do menu. Usuários e Diagnóstico: só a gestão. */
export function AbasConfiguracoes({ gestao }: { gestao: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Configurações" className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line-soft bg-bg-raised p-1">
      {ABAS.filter((a) => gestao || !a.gestao).map((a) => {
        const ativo = pathname === a.href;
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
              ativo ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
            )}
          >
            {a.nome}
          </Link>
        );
      })}
    </nav>
  );
}
