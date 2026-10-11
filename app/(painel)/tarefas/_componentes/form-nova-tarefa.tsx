"use client";

import { Aviso, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { cn } from "@/lib/utils";
import type { Pessoa } from "@/modulos/tarefas/regras";
import { useActionState } from "react";
import { criarTarefa } from "../acoes";

// "+ Nova tarefa" no topo de "A fazer": título + responsável (padrão: a pessoa do filtro). Enter cria.
export function FormNovaTarefa({ equipe, responsavelPadrao }: { equipe: Pessoa[]; responsavelPadrao: number | null }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(criarTarefa, {});

  return (
    <form action={acao} className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <input
          name="titulo"
          required
          maxLength={200}
          disabled={salvando}
          placeholder="+ Nova tarefa (Enter)"
          aria-label="Nova tarefa"
          className="min-w-0 flex-1 rounded-xl border border-dashed border-line bg-transparent px-3 py-2 text-[13px] text-ink outline-none focus:border-accent/60"
        />
        <select
          key={responsavelPadrao ?? "ninguem"}
          name="responsavel_id"
          defaultValue={responsavelPadrao ?? ""}
          aria-label="Responsável da nova tarefa"
          className={cn(classeSelect, "h-auto w-[88px] rounded-xl px-2 text-[12.5px]")}
        >
          <option value="" className={classeOpcao}>
            Ninguém
          </option>
          {equipe.map((p) => (
            <option key={p.id} value={p.id} className={classeOpcao}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      {estado.erro && <Aviso estado={estado} />}
    </form>
  );
}
