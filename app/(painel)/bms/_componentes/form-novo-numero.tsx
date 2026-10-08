"use client";

import { Button } from "@/components/ui/button";
import type { Bm, Pessoa } from "@/modulos/bms/regras";
import { useActionState } from "react";
import { criarNumero, type EstadoForm } from "../acoes";
import { Aviso } from "@/components/formulario";
import { CamposNumero } from "./campos";

export function FormNovoNumero({ bms, equipe }: { bms: Pick<Bm, "id" | "nome">[]; equipe: Pessoa[] }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(criarNumero, {});

  if (bms.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">Novo número</p>
        <p className="text-[13.5px] text-ink-dim">Cadastre uma BM primeiro.</p>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Novo número</p>
      <CamposNumero bms={bms} equipe={equipe} />
      <Button type="submit" disabled={salvando} className="self-start">
        {salvando ? "Salvando..." : "Cadastrar número"}
      </Button>
      <Aviso estado={estado} />
    </form>
  );
}
