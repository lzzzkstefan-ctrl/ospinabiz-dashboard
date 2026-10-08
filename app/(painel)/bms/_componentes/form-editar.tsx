"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Bm, Numero, Pessoa } from "@/modulos/bms/regras";
import { useActionState } from "react";
import { editarBm, editarNumero, type EstadoForm } from "../acoes";
import { Aviso } from "./aviso";
import { BotaoAtivo } from "./botao-ativo";
import { Campo, CamposNumero } from "./campos";

// Edição que abre no próprio card (sem trocar de página). Só aparece para admin.

function Gaveta({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    // fechada fica no fim da linha; aberta ocupa a largura toda do card
    <details className="group ml-auto [&[open]]:ml-0 [&[open]]:basis-full">
      <summary className="cursor-pointer list-none rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-white group-open:text-white">
        {rotulo}
      </summary>
      <div className="mt-3 rounded-2xl border border-line-soft bg-bg-raised p-4">{children}</div>
    </details>
  );
}

export function EditarBm({ bm }: { bm: Pick<Bm, "id" | "nome" | "acesso_admin" | "ativo"> }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(editarBm, {});

  return (
    <Gaveta rotulo="Editar BM">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={bm.id} />
        <Campo rotulo="Nome">
          <Input name="nome" maxLength={60} required defaultValue={bm.nome} />
        </Campo>
        <label className="flex items-center gap-2 text-[13px] text-ink-dim">
          <input type="checkbox" name="acesso_admin" defaultChecked={bm.acesso_admin} className="accent-[var(--accent)]" />
          Temos acesso de admin
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
        <Aviso estado={estado} />
      </form>
      <div className="mt-2 border-t border-line-soft pt-2">
        <BotaoAtivo tabela="bm" id={bm.id} ativo={bm.ativo} />
      </div>
    </Gaveta>
  );
}

export function EditarNumero({
  numero,
  bms,
  equipe,
}: {
  numero: Numero;
  bms: Pick<Bm, "id" | "nome">[];
  equipe: Pessoa[];
}) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(editarNumero, {});

  return (
    <Gaveta rotulo="Editar">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={numero.id} />
        <CamposNumero bms={bms} equipe={equipe} numero={numero} />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
        <Aviso estado={estado} />
      </form>
      <div className="mt-2 border-t border-line-soft pt-2">
        <BotaoAtivo tabela="numero" id={numero.id} ativo={numero.ativo} />
      </div>
    </Gaveta>
  );
}
