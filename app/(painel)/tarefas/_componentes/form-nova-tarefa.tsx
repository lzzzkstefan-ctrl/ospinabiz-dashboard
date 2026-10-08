"use client";

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import type { OpcoesTarefa } from "@/modulos/tarefas/dados";
import { useActionState } from "react";
import { criarTarefa } from "../acoes";
import { CamposTarefa } from "./campos-tarefa";

export function FormNovaTarefa({ opcoes }: { opcoes: OpcoesTarefa }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(criarTarefa, {});

  return (
    <form action={acao} className="glass flex flex-col gap-3 p-5">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Nova tarefa</p>
      <CamposTarefa opcoes={opcoes} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Criar tarefa"}
        </Button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
