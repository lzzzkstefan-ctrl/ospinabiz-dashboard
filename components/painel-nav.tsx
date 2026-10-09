"use client";

import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";
import {
  Activity,
  BadgeDollarSign,
  Building2,
  CalendarCheck,
  Filter,
  House,
  ListChecks,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Menu no estilo do masterview: pílula de vidro no topo (computador) e barra de
// ícones flutuante embaixo (celular). Módulo novo = um item aqui.
// `admin: true` = só admin vê. O bloqueio de verdade (endereço digitado) fica em
// lib/supabase/proxy.ts (ADMIN_PATHS): manter as duas listas iguais.
const TODOS = [
  { href: "/", label: "Início", icon: House, emBreve: false, admin: false },
  { href: "/monitor", label: "Monitor", icon: Activity, emBreve: false, admin: true },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks, emBreve: false, admin: false },
  { href: "/vendas", label: "Vendas", icon: BadgeDollarSign, emBreve: false, admin: false },
  { href: "/funil", label: "Funil", icon: Filter, emBreve: false, admin: false },
  { href: "/fechamento", label: "Fechamento", icon: CalendarCheck, emBreve: true, admin: true },
  { href: "/bms", label: "BMs", icon: Building2, emBreve: false, admin: true },
  { href: "/admin/usuarios", label: "Usuários", icon: Users, emBreve: true, admin: true },
];

const itens = (admin: boolean) => TODOS.filter((i) => admin || !i.admin);

function estaAtivo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pílula do topo (computador). `usuario` = e-mail de quem está logado. */
export function PainelNav({ usuario, admin = false }: { usuario?: React.ReactNode; admin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className="glass no-scrollbar fixed left-1/2 top-5 z-40 hidden max-w-[94vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full p-1.5 md:flex"
      aria-label="Navegação principal"
    >
      <span className="shrink-0 px-3 text-[12.5px] font-semibold text-white">Ospinabiz</span>
      {itens(admin).map(({ href, label, emBreve }) => {
        const ativo = estaAtivo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            title={emBreve ? `${label} (em breve)` : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-[12.5px] font-medium transition-colors",
              ativo
                ? "bg-accent/15 text-white"
                : emBreve
                  ? "text-ink-faint hover:bg-bg-raised-2 hover:text-white"
                  : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
            )}
          >
            {label}
          </Link>
        );
      })}
      {usuario && <span className="mx-1 h-5 w-px shrink-0 bg-line-soft" aria-hidden />}
      {usuario}
      <LogoutButton />
    </nav>
  );
}

/** Barra de ícones flutuante embaixo (celular). */
export function PainelNavMobile({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className="glass fixed bottom-4 left-1/2 z-40 flex w-[min(420px,calc(100vw-24px))] -translate-x-1/2 items-center justify-between rounded-full p-1.5 md:hidden"
      aria-label="Navegação principal"
    >
      {itens(admin).map(({ href, label, icon: Icon }) => {
        const ativo = estaAtivo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition-colors max-[360px]:h-8 max-[360px]:w-8",
              ativo ? "bg-accent text-background" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
            )}
          >
            <Icon size={18} />
          </Link>
        );
      })}
      <LogoutButton iconeSo />
    </nav>
  );
}
