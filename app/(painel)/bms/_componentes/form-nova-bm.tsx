"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionState } from "react";
import { criarBm, type EstadoForm } from "../acoes";
import { Aviso } from "./aviso";
import { Campo } from "./campos";

export function FormNovaBm() {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(criarBm, {});

  return (
    <form action={acao} className="flex flex-col gap-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Nova BM</p>
      <Campo rotulo="Nome">
        <Input name="nome" placeholder="ex.: BM 11" maxLength={60} required />
      </Campo>
      <label className="flex items-center gap-2 text-[13px] text-ink-dim">
        <input type="checkbox" name="acesso_admin" className="accent-[var(--accent)]" />
        Temos acesso de admin
      </label>
      <Button type="submit" disabled={salvando} className="self-start">
        {salvando ? "Salvando..." : "Cadastrar BM"}
      </Button>
      <Aviso estado={estado} />
    </form>
  );
}
