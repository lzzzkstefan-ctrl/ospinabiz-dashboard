"use client";

// Quais avisos do Check-in a pessoa quer (aba arquivada em 21/11/2026; ativar o aparelho foi para
// app/(painel)/_componentes/notificacoes-aparelho.tsx).

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { useActionState } from "react";
import { salvarPreferencias } from "../acoes";

/** Quais avisos a pessoa quer (vale para todos os aparelhos dela). */
export function FormPreferencias({ tipos, marcados }: { tipos: { id: string; nome: string }[]; marcados: Record<string, boolean> }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarPreferencias, {});
  return (
    <form action={acao} className="flex flex-col gap-2">
      {tipos.map((t) => (
        <label key={t.id} className="flex items-center gap-2.5 text-[13.5px] text-ink">
          <input type="checkbox" name={t.id} defaultChecked={marcados[t.id]} className="h-4 w-4 accent-[var(--accent)]" />
          {t.nome}
        </label>
      ))}
      <div className="mt-1 flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar avisos"}
        </Button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
