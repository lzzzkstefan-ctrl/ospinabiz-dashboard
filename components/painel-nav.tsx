"use client";

import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";
import { Archive, BadgeDollarSign, Clapperboard, FolderKanban, House, Layers, Scale, Settings, Trophy, Workflow } from "lucide-react";
import { ehAbaArquivada } from "@/lib/arquivo";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Menu no estilo do masterview: pílula de vidro no topo (computador) e barra de
// ícones flutuante embaixo (celular). Módulo novo = um item aqui.
// Central de gestão (21/11/2026): Hoje · Vendas · Arquivado · Configurações. As abas novas (Frentes,
// Funis, Estratégia, Projetos, Testes, Decisões, Biblioteca) entram aqui na fase em que ficarem prontas.
// `para`: quem vê o item. "gestao" = Davi e Rodrigo (app_metadata.gestao); "equipe" = todos menos o
// plantonista (que só cobria turnos); "todos" = qualquer logado. O bloqueio de verdade (endereço
// digitado) fica em lib/supabase/proxy.ts (GESTAO_PATHS e BLOQUEADO_PLANTONISTA): manter igual.
type Para = "todos" | "equipe" | "gestao";
const TODOS: { href: string; label: string; icon: typeof House; emBreve: boolean; para: Para }[] = [
  { href: "/", label: "Hoje", icon: House, emBreve: false, para: "gestao" },
  // Vendas fica igual para todos (a Vyenna ainda usa até a migração para o Prime)
  { href: "/vendas", label: "Vendas", icon: BadgeDollarSign, emBreve: false, para: "equipe" },
  { href: "/frentes", label: "Frentes", icon: Layers, emBreve: false, para: "gestao" },
  { href: "/funis", label: "Funis", icon: Workflow, emBreve: false, para: "gestao" },
  { href: "/projetos", label: "Projetos", icon: FolderKanban, emBreve: false, para: "gestao" },
  { href: "/criativos", label: "Criativos", icon: Clapperboard, emBreve: false, para: "gestao" },
  { href: "/decisoes", label: "Decisões", icon: Scale, emBreve: false, para: "gestao" },
  { href: "/progresso", label: "Progresso", icon: Trophy, emBreve: false, para: "gestao" },
  { href: "/arquivado", label: "Arquivado", icon: Archive, emBreve: false, para: "gestao" },
  // quem não é da gestão vê só Notificações dentro (a página confere)
  { href: "/configuracoes", label: "Configurações", icon: Settings, emBreve: false, para: "todos" },
];

export type PapelMenu = "admin" | "atendente" | "plantonista";

const itens = (papel: PapelMenu, gestao: boolean) =>
  TODOS.filter((i) => i.para === "todos" || (i.para === "equipe" && papel !== "plantonista") || (i.para === "gestao" && gestao));

function estaAtivo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // as telas antigas acendem "Arquivado"
  if (href === "/arquivado" && ehAbaArquivada(pathname)) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pílula do topo (computador). `usuario` = e-mail de quem está logado. */
export function PainelNav({ usuario, papel, gestao = false }: { usuario?: React.ReactNode; papel: PapelMenu; gestao?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className="glass no-scrollbar fixed left-1/2 top-5 z-40 hidden max-w-[94vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full p-1.5 md:flex"
      // a classe "glass-fora-da-tela" é posta de propósito fora do React (components/pausar-brilho.tsx)
      suppressHydrationWarning
      aria-label="Navegação principal"
    >
      <span className="shrink-0 px-3 text-[12.5px] font-semibold text-white">Ospinabiz</span>
      {itens(papel, gestao).map(({ href, label, emBreve }) => {
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
export function PainelNavMobile({ papel, gestao = false }: { papel: PapelMenu; gestao?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className="glass no-scrollbar fixed bottom-4 left-1/2 z-40 flex w-[min(460px,calc(100vw-24px))] -translate-x-1/2 items-center justify-between gap-0.5 overflow-x-auto rounded-full p-1.5 md:hidden"
      // a classe "glass-fora-da-tela" é posta de propósito fora do React (components/pausar-brilho.tsx)
      suppressHydrationWarning
      aria-label="Navegação principal"
    >
      {itens(papel, gestao).map(({ href, label, icon: Icon }) => {
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
