"use client";

// Números do Hoje: vendas e líquido (da tabela de vendas) e o investimento/CPL da semana, digitados à
// mão até a integração com o Prime (origem 'manual' | 'prime'). Líquido por lead x CPL fica vermelho
// quando cada lead traz menos do que custa.

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NumerosSemana } from "@/modulos/gestao/dados";
import { formatarBRL, porLead, type Numeros as N } from "@/modulos/gestao/regras";
import { useActionState, useEffect, useState } from "react";
import { salvarNumerosSemana } from "../../acoes-hoje";

const brl = (v: number) => formatarBRL(v);

export function Numeros({ vendas, semana, inv }: { vendas: N; semana: string; inv: NumerosSemana }) {
  const [editando, setEditando] = useState(false);
  const r = porLead(vendas.semana.liquido, inv);
  const semInvestimento = inv.cpl == null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Bloco rotulo="Hoje" vendas={vendas.hoje.vendas} liquido={vendas.hoje.liquido} />
        <Bloco rotulo="Semana" vendas={vendas.semana.vendas} liquido={vendas.semana.liquido} />
      </div>

      <div className={cn("glass-lite glass-static p-4", r.alerta && "border-[rgb(var(--tag-vermelho)/0.6)] bg-[rgb(var(--tag-vermelho)/0.06)]")}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-ink-faint">Líquido por lead x CPL · semana</p>
          <button type="button" onClick={() => setEditando((v) => !v)} className="text-[12px] text-ink-dim underline-offset-4 hover:text-white hover:underline">
            {editando ? "fechar" : semInvestimento ? "preencher" : "editar"}
          </button>
        </div>

        {semInvestimento && !editando ? (
          <p className="m-0 mt-2 text-[13px] text-ink-dim">Preencha o investimento e o CPL da semana para comparar com o líquido por lead.</p>
        ) : (
          !editando && (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={cn("text-[26px] font-semibold tabular-nums", r.alerta ? "text-[rgb(var(--tag-vermelho))]" : "text-white")}>
                  {r.liquidoPorLead == null ? "—" : brl(r.liquidoPorLead)}
                </span>
                <span className="text-[13px] text-ink-dim">
                  por lead · CPL <span className="tabular-nums text-ink">{brl(inv.cpl!)}</span>
                </span>
              </div>
              <p className={cn("m-0 mt-1 text-[12.5px]", r.alerta ? "text-[rgb(var(--tag-vermelho))]" : "text-ink-dim")}>
                {r.alerta
                  ? "Cada lead está trazendo menos do que custa."
                  : r.liquidoPorLead == null
                    ? "Sem leads para dividir."
                    : "O lead paga o próprio custo."}
              </p>
              <p className="m-0 mt-2 text-[11.5px] tabular-nums text-ink-faint">
                {inv.investimento != null && `investimento ${brl(inv.investimento)} · `}
                {r.leads != null && `${r.leads} leads${inv.leads == null ? " (investimento ÷ CPL)" : ""} · `}
                {inv.origem === "prime" ? "do Prime" : "digitado à mão"}
              </p>
            </>
          )
        )}
        {editando && <FormInvestimento semana={semana} inv={inv} onPronto={() => setEditando(false)} />}
      </div>
    </div>
  );
}

function Bloco({ rotulo, vendas, liquido }: { rotulo: string; vendas: number; liquido: number }) {
  return (
    <div className="glass-lite glass-static p-4">
      <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-ink-faint">{rotulo}</p>
      <p className="m-0 mt-1 text-[26px] font-semibold tabular-nums text-white">
        {vendas} <span className="text-[13px] font-normal text-ink-dim">{vendas === 1 ? "venda" : "vendas"}</span>
      </p>
      <p className="m-0 text-[13px] tabular-nums text-ink-dim">{brl(liquido)} líquido</p>
    </div>
  );
}

function FormInvestimento({ semana, inv, onPronto }: { semana: string; inv: NumerosSemana; onPronto: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarNumerosSemana, {});
  useEffect(() => {
    if (estado.ok) onPronto();
  }, [estado, onPronto]);
  const v = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
  return (
    <form action={acao} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="semana" value={semana} />
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[11.5px] text-ink-dim">
          Investimento (R$)
          <Input name="investimento" inputMode="decimal" defaultValue={v(inv.investimento)} placeholder="0,00" />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-ink-dim">
          CPL (R$)
          <Input name="cpl" inputMode="decimal" defaultValue={v(inv.cpl)} placeholder="0,00" />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-ink-dim">
          Leads (opcional)
          <Input name="leads" inputMode="numeric" defaultValue={inv.leads ?? ""} placeholder="auto" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Aviso estado={estado.erro ? estado : {}} />
      </div>
    </form>
  );
}
