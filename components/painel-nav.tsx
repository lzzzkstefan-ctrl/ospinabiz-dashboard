"use client";

import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";
import {
  Activity,
  BadgeDollarSign,
  Building2,
  CalendarCheck,
  CalendarClock,
  Filter,
  House,
  ListChecks,
  Presentation,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Menu no estilo do masterview: pílula de vidro no topo (computador) e barra de
// ícones flutuante embaixo (celular). Módulo novo = um item aqui.
// `para`: quem vê o item. "todos" = qualquer logado; "equipe" = admin e atendente (o plantonista,
// que só cobre turnos, não); "admin" = só admin. O bloqueio de verdade (endereço digitado) fica em
// lib/supabase/proxy.ts (ADMIN_PATHS e BLOQUEADO_PLANTONISTA): manter as listas iguais.
type Para = "todos" | "equipe" | "admin";
const TODOS: { href: string; label: string; icon: typeof House; emBreve: boolean; para: Para }[] = [
  { href: "/", label: "Início", icon: House, emBreve: false, para: "todos" },
  { href: "/monitor", label: "Monitor", icon: Activity, emBreve: false, para: "admin" },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks, emBreve: false, para: "todos" },
  { href: "/vendas", label: "Vendas", icon: BadgeDollarSign, emBreve: false, para: "equipe" },
  { href: "/funil", label: "Funil", icon: Filter, emBreve: false, para: "todos" },
  { href: "/escala", label: "Check-in", icon: CalendarClock, emBreve: false, para: "todos" },
  { href: "/webinarios", label: "Webinários", icon: Presentation, emBreve: false, para: "equipe" },
  { href: "/fechamento", label: "Fechamento", icon: CalendarCheck, emBreve: true, para: "admin" },
  { href: "/bms", label: "BMs", icon: Building2, emBreve: false, para: "admin" },
  { href: "/admin/usuarios", label: "Usuários", icon: Users, emBreve: true, para: "admin" },
];

export type PapelMenu = "admin" | "atendente" | "plantonista";

const itens = (papel: PapelMenu) =>
  TODOS.filter((i) => i.para === "todos" || (i.para === "equipe" && papel !== "plantonista") || (i.para === "admin" && papel === "admin"));

function estaAtivo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pílula do topo (computador). `usuario` = e-mail de quem está logado. */
export function PainelNav({ usuario, papel }: { usuario?: React.ReactNode; papel: PapelMenu }) {
  const pathname = usePathname();

  return (
    <nav
      className="glass no-scrollbar fixed left-1/2 top-5 z-40 hidden max-w-[94vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full p-1.5 md:flex"
      aria-label="Navegação principal"
    >
      <span className="shrink-0 px-3 text-[12.5px] font-semibold text-white">Ospinabiz</span>
      {itens(papel).map(({ href, label, emBreve }) => {
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
export function PainelNavMobile({ papel }: { papel: PapelMenu }) {
  const pathname = usePathname();

  return (
    <nav
      className="glass no-scrollbar fixed bottom-4 left-1/2 z-40 flex w-[min(460px,calc(100vw-24px))] -translate-x-1/2 items-center justify-between gap-0.5 overflow-x-auto rounded-full p-1.5 md:hidden"
      aria-label="Navegação principal"
    >
      {itens(papel).map(({ href, label, icon: Icon }) => {
        const ativo = estaAtivo(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors max-[360px]:h-8 max-[360px]:w-8",
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
