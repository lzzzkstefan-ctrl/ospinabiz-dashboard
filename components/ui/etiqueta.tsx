import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Etiqueta única do app (status, plataforma…): pílula translúcida, bolinha
// colorida e texto claro. Cores = tokens --tag-* em app/globals.css (.etiqueta-*).

export type CorEtiqueta = "verde" | "roxo" | "azul" | "laranja" | "vermelho" | "cinza";

export function Etiqueta({
  cor = "cinza",
  children,
  className,
}: {
  cor?: CorEtiqueta;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("etiqueta", `etiqueta-${cor}`, className)}>{children}</span>;
}
