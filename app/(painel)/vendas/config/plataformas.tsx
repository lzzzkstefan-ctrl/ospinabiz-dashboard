"use client";

// Plataformas de venda (só admin): lista com cor e ativar/desativar, e "+ plataforma".
// Plataforma não se apaga (venda antiga aponta para ela): desativada some do "Nova venda".
// Só a Hubla tem webhook: as outras são para lançamento manual.

import type { PlataformaLI } from "@/modulos/vendas/lock-in";
import { useState, useTransition } from "react";
import { criarPlataforma, editarPlataforma } from "../acoes-lockin";
import { botaoPrimario, botaoSecundario, campo } from "../_lockin/base";

export function Plataformas({ lista }: { lista: PlataformaLI[] }) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#3b82f6");
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();

  const rodar = (acao: () => Promise<{ erro?: string }>, depois?: () => void) =>
    startTransition(async () => {
      const r = await acao();
      setErro(r.erro ?? null);
      if (!r.erro) depois?.();
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-ink-dim">
        Aparecem no “Nova venda” e no chip de cada venda. Só a Hubla tem webhook: as outras são para lançamento manual. Desativar tira do
        “Nova venda”, mas as vendas antigas continuam com ela.
      </p>
      <ul className="flex flex-col">
        {lista.map((p) => (
          <li key={p.slug} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 last:border-b-0">
            <input
              type="color"
              defaultValue={p.cor}
              aria-label={`Cor de ${p.nome}`}
              disabled={pending}
              onBlur={(e) => e.target.value !== p.cor && rodar(() => editarPlataforma(p.slug, { cor: e.target.value }))}
              className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent"
            />
            <span className="w-32 text-[14px] text-white">{p.nome}</span>
            {p.slug === "hubla" && <span className="text-[11.5px] text-ink-faint">webhook</span>}
            {!p.ativa && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-dim">desativada</span>}
            <button type="button" disabled={pending} onClick={() => rodar(() => editarPlataforma(p.slug, { ativa: !p.ativa }))} className={`${botaoSecundario} ml-auto`}>
              {p.ativa ? "Desativar" : "Ativar"}
            </button>
          </li>
        ))}
      </ul>
      {aberto ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            rodar(
              () => criarPlataforma(nome, cor),
              () => {
                setNome("");
                setAberto(false);
              },
            );
          }}
          className="glass-lite glass-static flex flex-wrap items-end gap-3 p-4"
        >
          <label className="text-xs text-ink-dim">
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={40} autoFocus placeholder="Ex.: Eduzz" className={`${campo} mt-1 w-48`} />
          </label>
          <label className="text-xs text-ink-dim">
            Cor
            <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="mt-1 block h-9 w-12 cursor-pointer rounded border border-line bg-transparent" />
          </label>
          <button type="submit" disabled={pending} className={botaoPrimario}>
            {pending ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>
            Cancelar
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAberto(true)} className={`${botaoSecundario} self-start`}>
          + plataforma
        </button>
      )}
      {erro && (
        <p role="alert" className="text-[13px] text-accent-3">
          {erro}
        </p>
      )}
    </div>
  );
}
