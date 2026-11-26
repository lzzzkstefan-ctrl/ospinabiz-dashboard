// Faixa "Gasto do mês" no topo das telas de Criativos: quanto da IA já foi usado do limite.

import { cn } from "@/lib/utils";
import { reais, type Gasto } from "@/modulos/criativos/regras";

export function GastoDoMes({ gasto }: { gasto: Gasto }) {
  const pct = Math.min(100, Math.round((gasto.usado / gasto.limite) * 100));
  const alto = pct >= 80;
  return (
    <section aria-label="Gasto do mês com a IA" className="glass-lite glass-static flex flex-col gap-2 px-4 py-3">
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink-dim">
        <span className="font-semibold text-white">IA este mês</span>
        <span className="tabular-nums">
          {reais(gasto.usado)} de {reais(gasto.limite)}
        </span>
        <span className={cn("ml-auto tabular-nums", gasto.estourou ? "text-[rgb(var(--tag-vermelho))]" : alto ? "text-[rgb(var(--tag-laranja))]" : "text-ink-faint")}>
          {gasto.estourou ? "limite batido: a IA para até o mês que vem" : `${pct}%`}
        </span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-raised-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: `rgb(var(--tag-${gasto.estourou ? "vermelho" : alto ? "laranja" : "verde"}))` }}
        />
      </div>
    </section>
  );
}
