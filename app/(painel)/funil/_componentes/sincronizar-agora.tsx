"use client";

// Botão "Sincronizar agora" (só admin): chama /api/funil/sincronizar, que responde na hora e
// faz a rodada em segundo plano. A tela recarrega sozinha depois de ~40 s.

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SincronizarAgora() {
  const router = useRouter();
  const [estado, setEstado] = useState<"parado" | "rodando" | "erro">("parado");

  async function sincronizar() {
    setEstado("rodando");
    try {
      const r = await fetch("/api/funil/sincronizar", { method: "POST" });
      if (!r.ok) throw new Error(String(r.status));
      setTimeout(() => {
        router.refresh();
        setEstado("parado");
      }, 40_000);
    } catch {
      setEstado("erro");
    }
  }

  return (
    <button
      type="button"
      onClick={sincronizar}
      disabled={estado === "rodando"}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] text-ink transition-colors hover:text-white disabled:opacity-60"
    >
      <RefreshCw size={12} className={estado === "rodando" ? "animate-spin" : undefined} />
      {estado === "rodando" ? "Sincronizando… (atualiza em ~40 s)" : estado === "erro" ? "Falhou, tente de novo" : "Sincronizar agora"}
    </button>
  );
}
