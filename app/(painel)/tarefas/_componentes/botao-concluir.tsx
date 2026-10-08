"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useFormStatus } from "react-dom";
import { alternarConclusao } from "../acoes";

// Bolinha de concluir: vazia = pendente (clique conclui); cheia = concluída (clique reabre).
export function BotaoConcluir({ id, concluida }: { id: number; concluida: boolean }) {
  return (
    <form action={alternarConclusao} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={concluida ? "pendente" : "concluida"} />
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
        "flex h-6 w-6 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
        concluida
          ? "border-accent bg-accent text-background hover:bg-transparent hover:text-accent"
          : "border-line text-transparent hover:border-accent hover:text-accent",
      )}
    >
      <Check size={14} strokeWidth={3} />
    </button>
  );
}
