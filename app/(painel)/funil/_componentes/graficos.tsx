// Gráficos da tela Funil e Leads: uma série cada, na cor de destaque do projeto.
// Texto sempre nas cores de texto (ink); detalhe de cada barra no hover (title) e na tabela.

import { cn } from "@/lib/utils";
import type { LinhaFunil } from "@/modulos/funil/calculo";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Leads por dia: barras verticais finas, base embaixo, valor no topo só quando cabe. */
export function BarrasPorDia({ dias }: { dias: { dia: string; qtd: number }[] }) {
  const max = Math.max(1, ...dias.map((d) => d.qtd));
  const total = dias.reduce((s, d) => s + d.qtd, 0);
  // rótulo do eixo: no máximo ~8 datas, sempre a primeira e a última
  const passo = Math.max(1, Math.ceil(dias.length / 8));
  const poucas = dias.length <= 14;

  if (total === 0) return <p className="m-0 py-8 text-center text-[13px] italic text-ink-faint">Nenhum lead entrou neste período.</p>;

  return (
    <figure className="m-0">
      <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={`Leads por dia: ${total} no período, máximo de ${max} num dia`}>
        {dias.map((d) => (
          <div key={d.dia} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${diaCurto(d.dia)}: ${d.qtd} lead${d.qtd === 1 ? "" : "s"}`}>
            {poucas && d.qtd > 0 && <span className="mb-1 text-[11px] tabular-nums text-ink-dim">{d.qtd}</span>}
            <div
              className={cn("w-full max-w-[28px] rounded-t-[4px] transition-colors", d.qtd > 0 ? "bg-accent/70 group-hover:bg-accent" : "bg-line-soft")}
              style={{ height: d.qtd > 0 ? `${Math.max(3, (d.qtd / max) * 100)}%` : "2px" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] border-t border-line-soft pt-1.5">
        {dias.map((d, i) => (
          <span key={d.dia} className="min-w-0 flex-1 text-center text-[10.5px] tabular-nums text-ink-faint">
            {i % passo === 0 || i === dias.length - 1 ? diaCurto(d.dia) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Funil por etapa: tabela com barra horizontal (largura = % sobre o total que entrou no funil). */
export function FunilEtapas({ linhas, total, gapPara }: { linhas: LinhaFunil[]; total: number; gapPara: string | null }) {
  if (total === 0) return <p className="m-0 py-8 text-center text-[13px] italic text-ink-faint">Nenhum lead no funil neste período.</p>;
  return (
    <table className="w-full border-collapse text-left text-[13px] tabular-nums">
      <thead className="text-[11.5px] text-ink-dim">
        <tr>
          <th className="py-1.5 pr-3 font-medium">Etapa</th>
          <th className="w-[45%] py-1.5 pr-3 font-medium">
            <span className="sr-only">Barra</span>
          </th>
          <th className="py-1.5 pr-3 text-right font-medium">Leads</th>
          <th className="py-1.5 pr-3 text-right font-medium">% do total</th>
          <th className="py-1.5 text-right font-medium">Perda</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-line-soft text-ink-dim">
          <td className="py-1.5 pr-3">Entraram no funil</td>
          <td className="py-1.5 pr-3">
            <div className="h-2.5 w-full rounded-r-[4px] bg-accent/30" />
          </td>
          <td className="py-1.5 pr-3 text-right text-white">{total}</td>
          <td className="py-1.5 pr-3 text-right">100%</td>
          <td className="py-1.5 text-right" />
        </tr>
        {linhas.map((l) => {
          const destaque = gapPara === l.nome;
          return (
            <tr key={l.etapaId} className="border-t border-line-soft text-ink">
              <td className="whitespace-nowrap py-1.5 pr-3">{l.nome}</td>
              <td className="py-1.5 pr-3" title={`${l.nome}: ${l.qtd} lead${l.qtd === 1 ? "" : "s"} (${pct(l.pctTotal)} do total)`}>
                <div className="h-2.5 w-full">
                  <div className="h-full rounded-r-[4px] bg-accent" style={{ width: l.qtd ? `${Math.max(1.5, l.pctTotal * 100)}%` : 0 }} />
                </div>
              </td>
              <td className="py-1.5 pr-3 text-right text-white">{l.qtd}</td>
              <td className="py-1.5 pr-3 text-right text-ink-dim">{pct(l.pctTotal)}</td>
              <td className={cn("whitespace-nowrap py-1.5 text-right", destaque ? "font-semibold text-[rgb(var(--tag-vermelho))]" : "text-ink-dim")}>
                {l.perdaAnterior === null ? "" : l.perdaAnterior > 0 ? `−${pct(l.perdaAnterior)}` : "0%"}
                {destaque && <span className="ml-1 text-[11px] font-normal">maior gap</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
