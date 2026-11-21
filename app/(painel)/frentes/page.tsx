import { Etiqueta, type CorEtiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { carregarFrentes, vendasDoMesPorLinha } from "@/modulos/gestao/dados";
import { faixaDePreco, formatarBRL, hojeSP, STATUS_FRENTE } from "@/modulos/gestao/regras";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

// Frentes (fase 3, 21/11/2026): uma página por frente de venda. Só a gestão (proxy.ts + RLS).
export default function FrentesPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] leading-tight">Frentes</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Cada jeito de vender, com objetivo, meta, oferta e o funil ligado.</p>
      </header>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando…</p>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const usuario = await usuarioLogado();
  if (!usuario?.gestao) notFound();
  const [frentes, mes] = await Promise.all([carregarFrentes(), vendasDoMesPorLinha(hojeSP())]);
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {frentes.map((f) => {
        const st = STATUS_FRENTE[f.status];
        const real = f.linha_vendas ? mes[f.linha_vendas] : null;
        const front = f.ofertas.find((o) => o.tipo === "front");
        const pct = real && f.meta_mensal ? Math.min(100, Math.round((real.liquido / f.meta_mensal) * 100)) : null;
        return (
          <li key={f.id}>
            <Link href={`/frentes/${f.slug}`} className="glass-lite group flex h-full flex-col gap-3 p-5">
              <span className="flex items-center gap-3">
                <span className="text-[18px] font-semibold text-white">{f.nome}</span>
                <Etiqueta cor={st.cor as CorEtiqueta}>{st.nome}</Etiqueta>
                <ArrowUpRight size={16} className="ml-auto text-ink-faint transition-colors group-hover:text-white" aria-hidden />
              </span>
              <span className="line-clamp-2 text-[13px] leading-relaxed text-ink-dim">{f.canal ?? f.estrategia ?? "Ainda sem estratégia escrita."}</span>
              <span className="mt-auto flex flex-wrap items-end gap-x-6 gap-y-2 pt-2 text-[12px] text-ink-faint">
                {front && (
                  <span>
                    <span className="block uppercase tracking-[0.1em]">Front</span>
                    <span className="text-[15px] font-semibold tabular-nums text-white">{faixaDePreco(front.preco, front.preco_ate)}</span>
                  </span>
                )}
                {real && (
                  <span>
                    <span className="block uppercase tracking-[0.1em]">No mês</span>
                    <span className="text-[15px] font-semibold tabular-nums text-white">{formatarBRL(real.liquido)}</span>
                    <span className="ml-1.5">
                      {real.vendas} {real.vendas === 1 ? "venda" : "vendas"}
                    </span>
                  </span>
                )}
                {pct != null && (
                  <span className="min-w-[120px] flex-1">
                    <span className="block uppercase tracking-[0.1em]">Meta {pct}%</span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-bg-raised-2">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
