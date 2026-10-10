"use client";

// Botões do Check-in, usados na aba Check-in e no Início:
//   offline → "Entrei na operação"
//   online  → "Sair da operação" + "Pausa" (amarelo; escolhe o motivo)
//   em pausa → "Voltar da pausa" (amarelo) + "Sair da operação" (sair encerra a pausa junto)
// A hora é sempre a do servidor.

import { Aviso, type EstadoForm } from "@/components/formulario";
import { entrarNaOperacao, pausar, sairDaOperacao, voltarDaPausa } from "@/app/(painel)/escala/acoes";
import { cn } from "@/lib/utils";
import { useActionState, useState } from "react";

const MOTIVOS = [
  { id: "almoco", nome: "Almoço" },
  { id: "banho", nome: "Banho" },
  { id: "imprevisto", nome: "Imprevisto" },
  { id: "outro", nome: "Outro" },
];

// vidro líquido (.glass, com a borda que gira); a classe "glass-fora-da-tela" é posta de propósito
// fora do React (components/pausar-brilho.tsx), por isso o suppressHydrationWarning
const VIDRO = "glass h-14 rounded-full px-8 text-[16px] font-semibold text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60";
const AMARELO = "ring-1 ring-[rgb(var(--tag-amarelo)/0.6)] shadow-[0_0_24px_rgb(var(--tag-amarelo)/0.3),inset_0_1px_0_rgba(255,255,255,0.22)] text-[rgb(var(--tag-amarelo))]";
const VERDE = "ring-1 ring-[rgb(var(--tag-verde)/0.5)] shadow-[0_0_28px_rgb(var(--tag-verde)/0.35),inset_0_1px_0_rgba(255,255,255,0.22)]";

export type EstadoOperacao = { online: boolean; desde?: string; pausa?: { motivo: string; desde: string; minutos: number; longa: boolean } };

export function BotaoOperacao({ online, desde, pausa }: EstadoOperacao) {
  const [estEntrar, entrar, entrando] = useActionState<EstadoForm, FormData>(entrarNaOperacao, {});
  const [estSair, sair, saindo] = useActionState<EstadoForm, FormData>(sairDaOperacao, {});
  const [escolhendo, setEscolhendo] = useState(false);
  // começou a pausa: fecha a escolha do motivo (senão ela reabre sozinha ao voltar da pausa)
  const [estPausa, comecarPausa, pausando] = useActionState<EstadoForm, FormData>(async (anterior, form) => {
    const r = await pausar(anterior, form);
    if (r.ok) setEscolhendo(false);
    return r;
  }, {});
  const [estVoltar, voltar, voltando] = useActionState<EstadoForm, FormData>(voltarDaPausa, {});
  const ocupado = entrando || saindo || pausando || voltando;

  if (!online) {
    return (
      <form action={entrar} className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={ocupado} className={cn(VIDRO, "min-w-[250px]")} suppressHydrationWarning>
          {entrando ? "Entrando…" : "Entrei na operação"}
        </button>
        <Situacao cor="cinza" texto="Você está offline" />
        <Aviso estado={estEntrar} />
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {pausa ? (
          <form action={voltar}>
            <button type="submit" disabled={ocupado} className={cn(VIDRO, AMARELO, "min-w-[220px]")} suppressHydrationWarning>
              {voltando ? "Voltando…" : "Voltar da pausa"}
            </button>
          </form>
        ) : (
          <button type="button" disabled={ocupado} onClick={() => setEscolhendo((v) => !v)} className={cn(VIDRO, AMARELO, "min-w-[140px]")} aria-expanded={escolhendo} suppressHydrationWarning>
            Pausa
          </button>
        )}
        <form action={sair}>
          <button type="submit" disabled={ocupado} className={cn(VIDRO, !pausa && VERDE, "min-w-[220px]")} suppressHydrationWarning>
            {saindo ? "Saindo…" : "Sair da operação"}
          </button>
        </form>
        {pausa ? (
          <Situacao cor={pausa.longa ? "vermelho" : "amarelo"} texto={`Em pausa desde ${pausa.desde} (${pausa.motivo}) · ${pausa.minutos} min${pausa.longa ? " · pausa longa" : ""}`} />
        ) : (
          <Situacao cor="verde" texto={`Você está online${desde ? ` desde ${desde}` : ""}`} />
        )}
      </div>

      {/* escolha do motivo da pausa */}
      {!pausa && escolhendo && (
        <form action={comecarPausa} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[rgb(var(--tag-amarelo)/0.35)] bg-[rgb(var(--tag-amarelo)/0.05)] p-3">
          <span className="mr-1 text-[13px] text-ink-dim">Motivo:</span>
          {MOTIVOS.map((m, i) => (
            <label
              key={m.id}
              className="cursor-pointer rounded-full border border-line-soft px-3.5 py-1.5 text-[13px] text-ink has-[:checked]:border-[rgb(var(--tag-amarelo))] has-[:checked]:bg-[rgb(var(--tag-amarelo)/0.15)] has-[:checked]:text-white"
            >
              <input type="radio" name="motivo" value={m.id} defaultChecked={i === 0} className="sr-only" />
              {m.nome}
            </label>
          ))}
          <input
            name="detalhe"
            maxLength={120}
            placeholder="detalhe (opcional)"
            className="h-9 w-56 rounded-full border border-line-soft bg-transparent px-3.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-[rgb(var(--tag-amarelo))] focus:outline-none"
          />
          <button
            type="submit"
            disabled={pausando}
            className="h-9 rounded-full bg-[rgb(var(--tag-amarelo))] px-4 text-[13px] font-semibold text-[#0a1418] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pausando ? "Pausando…" : "Começar pausa"}
          </button>
          <button type="button" onClick={() => setEscolhendo(false)} className="text-[12.5px] text-ink-dim underline-offset-4 hover:underline">
            cancelar
          </button>
        </form>
      )}
      <Aviso estado={pausa ? estVoltar : estPausa.erro ? estPausa : estSair} />
    </div>
  );
}

function Situacao({ cor, texto }: { cor: "verde" | "amarelo" | "vermelho" | "cinza"; texto: string }) {
  const bolinha = { verde: "bg-[rgb(var(--tag-verde))]", amarelo: "bg-[rgb(var(--tag-amarelo))]", vermelho: "bg-[rgb(var(--tag-vermelho))]", cinza: "bg-ink-faint" }[cor];
  const textoCor = { verde: "text-white", amarelo: "text-[rgb(var(--tag-amarelo))]", vermelho: "font-semibold text-[rgb(var(--tag-vermelho))]", cinza: "text-ink-dim" }[cor];
  return (
    <span className="flex items-center gap-2 text-[13.5px]">
      <span className={cn("h-2.5 w-2.5 rounded-full", bolinha)} aria-hidden />
      <span className={textoCor}>{texto}</span>
    </span>
  );
}
