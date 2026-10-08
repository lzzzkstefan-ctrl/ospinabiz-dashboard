"use client";

import { Aviso, Gaveta, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import type { OpcoesTarefa } from "@/modulos/tarefas/dados";
import type { Tarefa } from "@/modulos/tarefas/regras";
import { useActionState } from "react";
import { editarTarefa } from "../acoes";
import { CamposTarefa } from "./campos-tarefa";

export function EditarTarefa({ tarefa, opcoes }: { tarefa: Tarefa; opcoes: OpcoesTarefa }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(editarTarefa, {});

  return (
    <Gaveta rotulo="Editar">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={tarefa.id} />
        <CamposTarefa opcoes={opcoes} tarefa={tarefa} />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
          <Aviso estado={estado} />
        </div>
      </form>
    </Gaveta>
  );
}
