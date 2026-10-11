"use client";

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import type { OpcoesTarefa } from "@/modulos/tarefas/dados";
import type { Tarefa } from "@/modulos/tarefas/regras";
import { useActionState, useEffect } from "react";
import { editarTarefa } from "../acoes";
import { CamposTarefa } from "./campos-tarefa";

// Modal de edição (abre ao clicar no cartão). Salvou: fecha. Esc ou clique fora: fecha sem salvar.
export function ModalTarefa({ tarefa, opcoes, onFechar }: { tarefa: Tarefa; opcoes: OpcoesTarefa; onFechar: () => void }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(editarTarefa, {});

  useEffect(() => {
    if (estado.ok) onFechar();
  }, [estado, onFechar]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar tarefa"
        className="w-full max-w-lg rounded-2xl border border-line bg-[#0a1418] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form action={acao} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={tarefa.id} />
          <CamposTarefa opcoes={opcoes} tarefa={tarefa} />
          <div className="flex flex-wrap items-center gap-3">
            <Aviso estado={estado} />
            <button type="button" onClick={onFechar} className="ml-auto rounded-full px-3 py-1.5 text-[13px] text-ink-dim hover:bg-bg-raised-2 hover:text-white">
              Cancelar
            </button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
