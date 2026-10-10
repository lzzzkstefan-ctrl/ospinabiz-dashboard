"use client";

// Botão "Entrei na operação" / "Sair da operação" (Check-in), usado na aba Check-in e no Início.

import { Aviso, type EstadoForm } from "@/components/formulario";
import { cn } from "@/lib/utils";
import { entrarNaOperacao, sairDaOperacao } from "@/app/(painel)/escala/acoes";
import { useActionState } from "react";

/**
 * Botão grande "Entrei na operação" (o atendente aperta ao ligar o PC). Online, vira "Sair da
 * operação". A hora é a do servidor.
 */
export function BotaoOperacao({ online, desde }: { online: boolean; desde?: string }) {
  const [estadoA, entrar, entrando] = useActionState<EstadoForm, FormData>(entrarNaOperacao, {});
  const [estadoB, sair, saindo] = useActionState<EstadoForm, FormData>(sairDaOperacao, {});
  return (
    <form action={online ? sair : entrar} className="flex flex-wrap items-center gap-4">
      {/* vidro líquido (.glass, com a borda que gira); online ganha o brilho verde */}
      <button
        type="submit"
        disabled={entrando || saindo}
        className={cn(
          "glass h-14 min-w-[250px] rounded-full px-8 text-[16px] font-semibold text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60",
          online && "shadow-[0_0_28px_rgb(var(--tag-verde)/0.35),inset_0_1px_0_rgba(255,255,255,0.22)] ring-1 ring-[rgb(var(--tag-verde)/0.5)]",
        )}
      >
        {online ? (saindo ? "Saindo…" : "Sair da operação") : entrando ? "Entrando…" : "Entrei na operação"}
      </button>
      <span className="flex items-center gap-2 text-[13.5px]">
        <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-[rgb(var(--tag-verde))]" : "bg-ink-faint"}`} aria-hidden />
        <span className={online ? "text-white" : "text-ink-dim"}>{online ? `Você está online${desde ? ` desde ${desde}` : ""}` : "Você está offline"}</span>
      </span>
      <Aviso estado={online ? estadoB : estadoA} />
    </form>
  );
}
