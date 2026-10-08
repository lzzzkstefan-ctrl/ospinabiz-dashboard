"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionState } from "react";
import { criarNumero, type EstadoForm } from "../acoes";
import { Aviso } from "./aviso";

export function FormNovoNumero({ bms }: { bms: { id: number; nome: string }[] }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(criarNumero, {});

  if (bms.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">Novo número</p>
        <p className="text-[13.5px] text-ink-dim">Cadastre uma BM ativa primeiro.</p>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Novo número</p>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-dim">
        BM
        <select
          name="bm_id"
          required
          defaultValue=""
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-ink shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Escolha a BM
          </option>
          {bms.map((bm) => (
            <option key={bm.id} value={bm.id} className="bg-[#0a1418]">
              {bm.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-dim">
        Telefone (com DDD)
        <Input name="telefone" inputMode="tel" placeholder="(11) 99999-0348" required />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-dim">
        Apelido na Data Crazy
        <Input name="apelido" placeholder="ex.: 0348 BM ALEMÃO" maxLength={60} required />
      </label>
      <Button type="submit" disabled={salvando} className="self-start">
        {salvando ? "Salvando..." : "Cadastrar número"}
      </Button>
      <Aviso estado={estado} />
    </form>
  );
}
