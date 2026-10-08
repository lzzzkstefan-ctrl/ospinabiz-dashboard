"use client";

import { useFormStatus } from "react-dom";
import { alternarAtivo } from "../acoes";

// Liga/desliga uma BM ou um número. Desativar tira dos testes sem apagar o histórico.
export function BotaoAtivo({ tabela, id, ativo }: { tabela: "bm" | "numero"; id: number; ativo: boolean }) {
  return (
    <form action={alternarAtivo}>
      <input type="hidden" name="tabela" value={tabela} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ativo" value={String(!ativo)} />
      <Botao ativo={ativo} />
    </form>
  );
}

function Botao({ ativo }: { ativo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-white disabled:opacity-50"
    >
      {pending ? "..." : ativo ? "Desativar" : "Ativar"}
    </button>
  );
}
