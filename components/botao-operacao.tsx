"use client";

// Botão "Entrei na operação" / "Sair da operação" (Check-in), usado na aba Check-in e no Início.

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
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
      <Button
        type="submit"
        disabled={entrando || saindo}
        variant={online ? "outline" : undefined}
        className="h-14 min-w-[240px] rounded-full px-8 text-[16px] font-semibold"
      >
        {online ? (saindo ? "Saindo…" : "Sair da operação") : entrando ? "Entrando…" : "Entrei na operação"}
      </Button>
      <span className="flex items-center gap-2 text-[13.5px]">
        <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-[rgb(var(--tag-verde))]" : "bg-ink-faint"}`} aria-hidden />
        <span className={online ? "text-white" : "text-ink-dim"}>{online ? `Você está online${desde ? ` desde ${desde}` : ""}` : "Você está offline"}</span>
      </span>
      <Aviso estado={online ? estadoB : estadoA} />
    </form>
  );
}
