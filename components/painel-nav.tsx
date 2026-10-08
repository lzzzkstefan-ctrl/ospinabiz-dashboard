"use client";

import { cn } from "@/lib/utils";
import { Activity, BadgeDollarSign, Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/monitor", label: "Monitor", icon: Activity, emBreve: false },
  { href: "/vendas", label: "Vendas", icon: BadgeDollarSign, emBreve: true },
  { href: "/bms", label: "BMs", icon: Building2, emBreve: true },
];

export function PainelNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 md:flex-col">
      {ITENS.map(({ href, label, icon: Icon, emBreve }) => {
        const ativo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              ativo
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon size={16} />
            <span>{label}</span>
            {emBreve && (
              <span className="ml-auto hidden text-[10px] uppercase tracking-wide text-muted-foreground md:inline">
                em breve
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
