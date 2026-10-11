"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useFormStatus } from "react-dom";
import { alternarConclusao } from "../acoes";

// Bolinha de concluir: vazia = fora de Feito (clique conclui); cheia = em Feito (clique reabre em "A fazer").
export function BotaoConcluir({ id, concluida }: { id: number; concluida: boolean }) {
  return (
    <form action={alternarConclusao} className="shrink-0" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={concluida ? "a_fazer" : "feito"} />
      <Bolinha concluida={concluida} />
    </form>
  );
}

function Bolinha({ concluida }: { concluida: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={concluida ? "Reabrir tarefa" : "Concluir tarefa"}
      title={concluida ? "Reabrir" : "Concluir"}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
        concluida
          ? "border-accent bg-accent text-background hover:bg-transparent hover:text-accent"
          : "border-line text-transparent hover:border-accent hover:text-accent",
      )}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );
}
