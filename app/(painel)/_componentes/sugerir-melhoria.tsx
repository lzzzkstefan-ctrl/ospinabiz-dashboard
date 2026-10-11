"use client";

// "Sugerir melhoria" (Início): qualquer pessoa logada. A sugestão cai em "Ideia" na aba Melhorias.

import { Aviso, Campo, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ABAS } from "@/modulos/melhorias/regras";
import { Lightbulb } from "lucide-react";
import { useActionState } from "react";
import { sugerirMelhoria } from "../melhorias/acoes";

export function SugerirMelhoria() {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(sugerirMelhoria, {});
  return (
    <details className="group glass-lite glass-static p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-semibold text-white">
        <Lightbulb className="size-4 text-accent" />
        Sugerir melhoria
        <span className="text-[12.5px] font-normal text-ink-faint">— viu algo que dava para ser melhor na dashboard? Conta aqui.</span>
      </summary>
      {estado.ok ? (
        <p role="status" className="m-0 mt-3 text-[13px] text-ink-dim">
          {estado.ok}
        </p>
      ) : (
        <form action={acao} className="mt-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Campo rotulo="O que melhorar">
              <Input name="titulo" maxLength={120} required placeholder="Ex.: mostrar o nome do vendedor na fila" />
            </Campo>
            <Campo rotulo="Aba">
              <select name="aba" defaultValue="" className={classeSelect}>
                <option value="" className={classeOpcao}>
                  Não sei / geral
                </option>
                {ABAS.map((a) => (
                  <option key={a} value={a} className={classeOpcao}>
                    {a}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo rotulo="Detalhes (opcional)">
            <textarea name="descricao" maxLength={2000} rows={3} className={cn(classeSelect, "h-auto py-2")} />
          </Campo>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pendente}>
              {pendente ? "Enviando…" : "Enviar sugestão"}
            </Button>
            <Aviso estado={estado} />
          </div>
        </form>
      )}
    </details>
  );
}
