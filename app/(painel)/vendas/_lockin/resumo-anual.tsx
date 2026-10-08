"use client";

// Resumo anual (igual ao do Lock in): cards do ano, gráfico de vendas e comissão por
// mês e a tabela mês a mês. Vale o fechamento gravado; sem ele, o calculado pelo app
// (no % sugerido pela margem do mês; sem sugestão, a 10%, marcado "sem %").

import { nomeDoMesNumero, type MesAnual } from "@/modulos/vendas/lock-in";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";
import { formatBRL } from "./base";

const cartao = "rounded-2xl border border-line-soft bg-bg-raised-2 p-4";
const curto = (mes: number) => nomeDoMesNumero(mes).slice(0, 3);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ResumoAnual({ ano, anos, meses, base }: { ano: number; anos: number[]; meses: MesAnual[]; base: string }) {
  const comDado = meses.filter((m) => m.fonte);
  const vendas = comDado.reduce((s, m) => s + m.vendas, 0);
  const comissao = comDado.reduce((s, m) => s + m.comissao, 0);
  const n = comDado.length;
  const ranking = [...comDado].sort((a, b) => b.vendas - a.vendas);
  const melhor = ranking[0];
  const pior = ranking.length > 1 ? ranking[ranking.length - 1] : undefined;
  const calculados = comDado.filter((m) => m.fonte === "calculado").length;

  const cards = [
    { lbl: "vendas no ano", num: String(vendas), sub: `${n} ${n === 1 ? "mês" : "meses"} com dado` },
    { lbl: "comissão no ano", num: formatBRL(comissao), destaque: true },
    { lbl: "média por mês", num: n ? formatBRL(Math.round(comissao / n)) : "—", sub: n ? `${Math.round(vendas / n)} vendas/mês` : undefined },
    { lbl: "melhor mês", num: melhor ? cap(nomeDoMesNumero(melhor.mes)) : "—", sub: melhor ? `${melhor.vendas} vendas` : undefined },
    { lbl: "pior mês", num: pior ? cap(nomeDoMesNumero(pior.mes)) : "—", sub: pior ? `${pior.vendas} vendas` : undefined },
  ];

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-1.5" aria-label="Ano">
        {anos.map((a) => (
          <Link
            key={a}
            href={`${base}&visao=ano&ano=${a}`}
            aria-current={a === ano ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[12.5px] font-medium tabular-nums transition-colors",
              a === ano ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
            )}
          >
            {a}
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.lbl} className={cn(cartao, c.destaque && "border-accent/40")}>
            <span className="block text-[22px] font-semibold leading-none tabular-nums text-white">{c.num}</span>
            <span className="mt-1 block text-xs text-ink-dim">{c.lbl}</span>
            {c.sub && <span className="mt-0.5 block text-[11.5px] tabular-nums text-ink-faint">{c.sub}</span>}
          </div>
        ))}
      </section>
      {calculados > 0 && (
        <p className="m-0 -mt-3 text-[12px] text-ink-faint">
          {calculados} {calculados === 1 ? "mês entra" : "meses entram"} pelo calculado do app (sem fechamento registrado).
        </p>
      )}

      <Grafico meses={meses} />

      <section className="glass-lite glass-static overflow-x-auto p-4">
        <h3 className="mb-3 text-[15px] font-semibold text-white">Mês a mês</h3>
        <table className="w-full border-collapse text-left text-[13px] tabular-nums">
          <thead className="text-[11.5px] text-ink-dim">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Mês</th>
              <th className="py-1.5 pr-3 text-right font-medium">Vendas</th>
              <th className="py-1.5 pr-3 text-right font-medium">Comissão</th>
              <th className="py-1.5 font-medium">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className={cn("border-t border-line-soft align-top", m.fonte ? "text-ink" : "text-ink-faint")}>
                <td className="whitespace-nowrap py-2 pr-3">
                  <Link href={`${base}&mes=${ano}-${String(m.mes).padStart(2, "0")}`} className="underline-offset-4 hover:underline">
                    {cap(nomeDoMesNumero(m.mes))}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-right">{m.fonte ? m.vendas : "—"}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right text-white">
                  {m.fonte && <span className="mr-1.5 text-[11px] text-ink-faint">{m.margem ? `${m.margem}%` : "sem % (10%)"}</span>}
                  {m.fonte ? formatBRL(m.comissao) : "—"}
                </td>
                <td className="py-2 text-[12px]">
                  {!m.fonte ? (
                    <span className="italic">sem dado</span>
                  ) : (
                    <span className="flex flex-col items-start gap-0.5">
                      {m.fonte === "fechamento" ? (
                        <span className="text-ink-dim">fechado</span>
                      ) : (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-dim">calculado</span>
                      )}
                      {(m.reembolsos > 0 || m.chargebacks > 0) && (
                        <span className="text-ink-dim">
                          {m.reembolsos} reembolso{m.reembolsos === 1 ? "" : "s"}
                          {m.chargebacks ? ` · ${m.chargebacks} chargeback${m.chargebacks === 1 ? "" : "s"}` : ""}
                        </span>
                      )}
                      {m.adiantamentos.map((a) => (
                        <span key={a.id} className="text-ink-dim">
                          adiantamento {a.data.slice(8, 10)}/{a.data.slice(5, 7)}: −{formatBRL(a.valor)}
                        </span>
                      ))}
                      {m.adiantamentos.length > 0 && m.valorFinal != null && <span className="text-white">a receber {formatBRL(m.valorFinal)}</span>}
                      {m.difere && <span className="text-accent-3">≠ as vendas mudaram depois do fechamento</span>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** Barras de vendas em cima e linha de comissão embaixo. Barra clara = calculado. */
function Grafico({ meses }: { meses: MesAnual[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const W = 600;
  const esq = 8;
  const col = (W - esq * 2) / 12;
  const barrasH = 130;
  const linhaTopo = barrasH + 34;
  const linhaH = 80;
  const H = linhaTopo + linhaH + 22;
  const maxV = Math.max(1, ...meses.map((m) => (m.fonte ? m.vendas : 0)));
  const maxC = Math.max(1, ...meses.map((m) => (m.fonte ? m.comissao : 0)));
  const x = (i: number) => esq + col * i + col / 2;
  const yC = (c: number) => linhaTopo + linhaH - (c / maxC) * (linhaH - 8);

  const trechos: string[] = [];
  let atual = "";
  meses.forEach((m, i) => {
    if (!m.fonte) {
      if (atual) trechos.push(atual);
      atual = "";
      return;
    }
    atual += `${atual ? "L" : "M"}${x(i).toFixed(1)},${yC(m.comissao).toFixed(1)}`;
  });
  if (atual) trechos.push(atual);
  const f = foco != null ? meses[foco] : null;

  return (
    <section className="glass-lite glass-static p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-white">Vendas e comissão por mês</h3>
        <span className="text-[11.5px] text-ink-faint">barra clara = calculado pelo app</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Vendas por mês (barras) e comissão por mês (linha)">
          <text x={esq} y={10} className="fill-ink-faint text-[10px]">
            vendas
          </text>
          <line x1={esq} x2={W - esq} y1={barrasH} y2={barrasH} className="stroke-line" strokeWidth={1} />
          {meses.map((m, i) => {
            if (!m.fonte) return null;
            const h = Math.max(2, (m.vendas / maxV) * (barrasH - 22));
            const w = Math.min(28, col - 8);
            return (
              <g key={m.mes}>
                <path
                  d={`M${x(i) - w / 2},${barrasH} V${barrasH - h + 4} q0,-4 4,-4 H${x(i) + w / 2 - 4} q4,0 4,4 V${barrasH} Z`}
                  className={cn("fill-accent transition-opacity", m.fonte === "calculado" && "opacity-40", foco != null && foco !== i && "opacity-30")}
                />
                {(foco === i || m.vendas === maxV) && (
                  <text x={x(i)} y={barrasH - h - 5} textAnchor="middle" className="fill-ink text-[10px] tabular-nums">
                    {m.vendas}
                  </text>
                )}
              </g>
            );
          })}
          <text x={esq} y={linhaTopo - 8} className="fill-ink-faint text-[10px]">
            comissão
          </text>
          <line x1={esq} x2={W - esq} y1={linhaTopo + linhaH} y2={linhaTopo + linhaH} className="stroke-line" strokeWidth={1} />
          {trechos.map((d) => (
            <path key={d} d={d} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {meses.map((m, i) =>
            m.fonte ? (
              <circle
                key={m.mes}
                cx={x(i)}
                cy={yC(m.comissao)}
                r={foco === i ? 5 : 3.5}
                className={cn("stroke-background", m.fonte === "calculado" ? "fill-ink-dim" : "fill-accent")}
                strokeWidth={2}
              />
            ) : null,
          )}
          {meses.map((m, i) => (
            <text key={m.mes} x={x(i)} y={H - 6} textAnchor="middle" className={cn("text-[10.5px]", foco === i ? "fill-white" : "fill-ink-faint")}>
              {curto(m.mes)}
            </text>
          ))}
          {meses.map((m, i) => (
            <rect
              key={m.mes}
              x={esq + col * i}
              y={0}
              width={col}
              height={H}
              fill="transparent"
              onMouseEnter={() => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
              onClick={() => setFoco(i)}
            />
          ))}
        </svg>
        {f && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-xl border border-line bg-bg-raised-2 px-3 py-2 text-[12px] shadow-lg"
            style={{ left: `${Math.min(88, Math.max(12, (x(foco!) / W) * 100))}%` }}
          >
            <div className="font-medium text-white">{cap(nomeDoMesNumero(f.mes))}</div>
            {f.fonte ? (
              <>
                <div className="tabular-nums text-ink">{f.vendas} vendas</div>
                <div className="tabular-nums text-ink">{formatBRL(f.comissao)}</div>
                <div className="text-ink-faint">{f.fonte === "fechamento" ? "fechamento" : "calculado"}</div>
              </>
            ) : (
              <div className="text-ink-faint">sem dado</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
