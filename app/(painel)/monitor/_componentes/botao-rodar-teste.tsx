"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Dispara um teste na hora (rota app/api/monitor/rodar-teste, com o login de quem clicou).
// Fica desligado até as variáveis da Meta existirem.
export function BotaoRodarTeste({ habilitado }: { habilitado: boolean }) {
  const router = useRouter();
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [rodando, iniciar] = useTransition();

  const rodar = () =>
    iniciar(async () => {
      setMensagem(null);
      const resposta = await fetch("/api/monitor/rodar-teste", { method: "POST" });
      if (resposta.ok) {
        setMensagem("Teste disparado. O resultado aparece em alguns minutos.");
        router.refresh();
      } else if (resposta.status === 501) {
        setMensagem("O envio do teste ainda não foi implementado.");
      } else if (resposta.status === 401) {
        setMensagem("Entre de novo para rodar o teste.");
      } else {
        setMensagem("Não deu para disparar o teste. Tente de novo.");
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={rodar} disabled={!habilitado || rodando}>
        {rodando ? "Disparando..." : "Rodar teste agora"}
      </Button>
      <p className="text-[12.5px] text-ink-faint">
        {mensagem ?? (habilitado ? "" : "Aguardando configurar a Meta (número remetente e template).")}
      </p>
    </div>
  );
}
