"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionState } from "react";
import { criarBm, type EstadoForm } from "../acoes";
import { Aviso } from "./aviso";

export function FormNovaBm() {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(criarBm, {});

  return (
    <form action={acao} className="flex flex-col gap-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Nova BM</p>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-dim">
        Nome
        <Input name="nome" placeholder="ex.: BM ALEMÃO" maxLength={60} required />
      </label>
      <Button type="submit" disabled={salvando} className="self-start">
        {salvando ? "Salvando..." : "Cadastrar BM"}
      </Button>
      <Aviso estado={estado} />
    </form>
  );
}
