"use client";

// Chamar a IA (app/api/criativos/gerar) a partir de um botão. A resposta leva de 20 s a 2 min.

import type { SaidaPorModo } from "@/modulos/criativos/formatos";
import type { Modo } from "@/modulos/criativos/regras";
import { Check, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type Gerado<M extends Modo> = { geracaoId: number; modo: M; saida: SaidaPorModo[M]; custo: number };

export function useGerar<M extends Modo>(modo: M) {
  const router = useRouter();
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Gerado<M> | null>(null);

  async function gerar(corpo: { criativo_id?: number; texto?: string; link?: string }) {
    setPendente(true);
    setErro(null);
    try {
      const resp = await fetch("/api/criativos/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo, ...corpo }),
      });
      const r = (await resp.json().catch(() => null)) as ({ ok: true } & Gerado<M>) | { ok: false; erro: string } | null;
      if (!r) setErro(resp.status === 504 ? "A IA demorou demais. Tenta de novo." : "Não deu pra falar com o servidor.");
      else if (!r.ok) setErro(r.erro);
      else setResultado({ geracaoId: r.geracaoId, modo: r.modo, saida: r.saida, custo: r.custo });
    } catch {
      setErro("Sem conexão. Confere a internet e tenta de novo.");
    } finally {
      setPendente(false);
      router.refresh(); // atualiza o gasto do mês e o histórico
    }
  }

  return { gerar, pendente, erro, resultado, limpar: () => setResultado(null) };
}

export function Escrevendo() {
  return (
    <p role="status" className="m-0 flex items-center gap-2 text-[13px] text-ink-dim">
      <Loader2 size={14} className="animate-spin" aria-hidden /> A IA tá escrevendo… leva de 20 segundos a 2 minutos. Pode ficar nessa tela.
    </p>
  );
}

export function ErroIA({ erro }: { erro: string | null }) {
  if (!erro) return null;
  return (
    <p role="alert" className="m-0 text-[13px] text-[rgb(var(--tag-vermelho))]">
      {erro}
    </p>
  );
}

/** Botão de copiar texto (lista de gravação, hooks...). */
export function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 1600);
        } catch {
          /* navegador sem permissão de copiar: não faz nada */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-white"
    >
      {ok ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {ok ? "Copiado" : rotulo}
    </button>
  );
}
