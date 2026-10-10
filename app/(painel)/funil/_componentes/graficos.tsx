// Gráficos da tela Funil e Leads: uma série cada, na cor de destaque do projeto.
// Texto sempre nas cores de texto (ink). Tudo sai do MESMO resultado (mesma lista de leads):
// barra, tooltip por número e tabela por número sempre somam o total do card.

import { cn } from "@/lib/utils";
import type { LinhaFunil, PorNumero } from "@/modulos/funil/calculo";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const SEM_CONVERSA = "ainda sem conversa";

/** Lista "número: leads" (do maior para o menor; "ainda sem conversa" por último). */
function ListaPorNumero({ porNumero, nomes }: { porNumero: PorNumero; nomes: Map<string, string> }) {
  return (
    <ul className="m-0 list-none p-0">
      {porNumero.map((n) => (
        <li key={n.numeroId ?? "sem"} className="flex justify-between gap-4 whitespace-nowrap">
          <span className={n.numeroId ? "text-ink" : "italic text-ink-dim"}>{n.numeroId ? (nomes.get(n.numeroId) ?? "número sem nome") : SEM_CONVERSA}</span>
          <span className="tabular-nums text-white">{n.qtd}</span>
        </li>
      ))}
    </ul>
  );
}

/** Leads por dia: barras verticais finas; no hover, o total do dia e a divisão por número. */
/** Linha vertical de "mudança no funil" no dia (descrições no hover). */
function Marca({ textos }: { textos: string[] | undefined }) {
  if (!textos?.length) return null;
  return (
    <span
      className="pointer-events-auto absolute inset-y-0 left-1/2 z-10 w-0 border-l-2 border-dashed border-[rgb(var(--tag-laranja))]"
      title={["Mudança no funil:", ...textos].join("\n")}
      aria-label={`Mudança no funil: ${textos.join("; ")}`}
    />
  );
}

export function BarrasPorDia({
  dias,
  nomes,
  marcas,
}: {
  dias: { dia: string; qtd: number; porNumero: PorNumero }[];
  nomes: Map<string, string>;
  /** dia → descrições das mudanças registradas no funil */
  marcas?: Map<string, string[]>;
}) {
  const max = Math.max(1, ...dias.map((d) => d.qtd));
  const total = dias.reduce((s, d) => s + d.qtd, 0);
  // rótulo do eixo: no máximo ~8 datas, sempre a primeira e a última
  const passo = Math.max(1, Math.ceil(dias.length / 8));
  const poucas = dias.length <= 14;

  if (total === 0) return <p className="m-0 py-8 text-center text-[13px] italic text-ink-faint">Nenhum lead entrou neste período.</p>;

  return (
    <figure className="m-0">
      <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={`Leads por dia: ${total} no período, máximo de ${max} num dia`}>
        {dias.map((d, i) => {
          // tooltip não sai da tela nas pontas
          const lado = i < dias.length / 3 ? "left-0" : i > (dias.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
            <div key={d.dia} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" tabIndex={d.qtd > 0 ? 0 : -1}>
              <Marca textos={marcas?.get(d.dia)} />
              {poucas && d.qtd > 0 && <span className="mb-1 text-[11px] tabular-nums text-ink-dim">{d.qtd}</span>}
              <div
                className={cn(
                  "w-full max-w-[28px] rounded-t-[4px] transition-colors",
                  d.qtd > 0 ? "bg-accent/70 group-hover:bg-accent group-focus:bg-accent" : "bg-line-soft",
                )}
                style={{ height: d.qtd > 0 ? `${Math.max(3, (d.qtd / max) * 100)}%` : "2px" }}
              />
              {d.qtd > 0 && (
                <div
                  role="tooltip"
                  className={cn(
                    "pointer-events-none absolute bottom-full z-20 mb-2 hidden min-w-[190px] rounded-xl border border-line bg-[var(--bg)] p-2.5 text-[12px] shadow-lg group-hover:block group-focus:block",
                    lado,
                  )}
                >
                  <p className="m-0 mb-1.5 flex justify-between gap-4 border-b border-line-soft pb-1.5 text-ink">
                    <span>{diaCurto(d.dia)}</span>
                    <span className="tabular-nums text-white">
                      {d.qtd} lead{d.qtd === 1 ? "" : "s"}
                    </span>
                  </p>
                  <ListaPorNumero porNumero={d.porNumero} nomes={nomes} />
                </div>
              )}
            </div>
          );
        })}
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

/** Leads do período por número (mesma lista do card): cada lead uma vez, no número da primeira conversa. */
export function TabelaPorNumero({ porNumero, total, nomes }: { porNumero: PorNumero; total: number; nomes: Map<string, string> }) {
  if (total === 0) return <p className="m-0 py-4 text-center text-[13px] italic text-ink-faint">Nenhum lead neste período.</p>;
  return (
    <table className="w-full border-collapse text-left text-[13px] tabular-nums">
      <thead className="text-[11.5px] text-ink-dim">
        <tr>
          <th className="py-1.5 pr-3 font-medium">Número</th>
          <th className="py-1.5 pr-3 text-right font-medium">Leads</th>
          <th className="py-1.5 text-right font-medium">% do total</th>
        </tr>
      </thead>
      <tbody>
        {porNumero.map((n) => (
          <tr key={n.numeroId ?? "sem"} className="border-t border-line-soft text-ink">
            <td className={cn("py-1.5 pr-3", !n.numeroId && "italic text-ink-dim")}>{n.numeroId ? (nomes.get(n.numeroId) ?? "número sem nome") : SEM_CONVERSA}</td>
            <td className="py-1.5 pr-3 text-right text-white">{n.qtd}</td>
            <td className="py-1.5 text-right text-ink-dim">{pct(n.qtd / total)}</td>
          </tr>
        ))}
        <tr className="border-t border-line text-white">
          <td className="py-1.5 pr-3 font-medium">Total</td>
          <td className="py-1.5 pr-3 text-right font-medium">{total}</td>
          <td className="py-1.5 text-right text-ink-dim">100%</td>
        </tr>
      </tbody>
    </table>
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

/** Conversão por dia (%, uma série): dos leads do funil que entraram no dia, quantos chegaram no alvo. */
export function BarrasConversao({ dias, marcas }: { dias: { dia: string; base: number; chegaram: number }[]; marcas?: Map<string, string[]> }) {
  const comBase = dias.filter((d) => d.base > 0);
  if (!comBase.length) return <p className="m-0 py-8 text-center text-[13px] italic text-ink-faint">Nenhum lead no funil neste período.</p>;
  const passo = Math.max(1, Math.ceil(dias.length / 8));
  const poucas = dias.length <= 14;
  return (
    <figure className="m-0">
      <div className="flex h-36 items-end gap-[2px]" role="img" aria-label="Conversão por dia">
        {dias.map((d) => {
          const p = d.base ? d.chegaram / d.base : null;
          return (
            <div
              key={d.dia}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              title={p === null ? `${diaCurto(d.dia)}: sem leads no funil` : `${diaCurto(d.dia)}: ${pct(p)} (${d.chegaram} de ${d.base})`}
            >
              <Marca textos={marcas?.get(d.dia)} />
              {poucas && p !== null && <span className="mb-1 text-[11px] tabular-nums text-ink-dim">{pct(p)}</span>}
              <div
                className={cn("w-full max-w-[28px] rounded-t-[4px]", p ? "bg-accent/70 group-hover:bg-accent" : "bg-line-soft")}
                style={{ height: p ? `${Math.max(3, p * 100)}%` : "2px" }}
              />
            </div>
          );
        })}
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
