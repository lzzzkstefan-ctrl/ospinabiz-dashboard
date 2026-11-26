"use client";

// Lista de criativos em colunas por status (ideia → roteiro → gravar → gravado → no ar → venceu/perdeu),
// com filtro por origem e busca. O status muda direto no cartão; clicar no título abre o criativo.

import { Etiqueta } from "@/components/ui/etiqueta";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CriativoResumo } from "@/modulos/criativos/dados";
import { nomeOrigem, ORIGENS, STATUS, type Origem, type Status } from "@/modulos/criativos/regras";
import { GitBranch, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { mudarStatus } from "../acoes";

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ListaCriativos({ itens }: { itens: CriativoResumo[] }) {
  const [origem, setOrigem] = useState<Origem | "todas">("todas");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const visiveis = useMemo(() => {
    const q = normalizar(busca.trim());
    return itens.filter((c) => (origem === "todas" || c.origem === origem) && (!q || normalizar(`${c.titulo} ${c.hook ?? ""}`).includes(q)));
  }, [itens, origem, busca]);
  const porStatus = useMemo(() => {
    const m = {} as Record<Status, CriativoResumo[]>;
    for (const s of STATUS) m[s.id] = visiveis.filter((c) => c.status === s.id);
    return m;
  }, [visiveis]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1.5" aria-label="Filtro por origem">
          {[{ id: "todas" as const, nome: "Todas" }, ...ORIGENS].map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOrigem(o.id)}
              aria-pressed={origem === o.id}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                origem === o.id ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
              )}
            >
              {o.nome}
            </button>
          ))}
        </nav>
        <label className="relative ml-auto w-full sm:w-[240px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar título ou hook" aria-label="Buscar" className="pl-8" />
        </label>
      </div>

      {erro && (
        <p role="alert" className="m-0 text-[13px] text-accent-3">
          {erro}
        </p>
      )}

      {itens.length === 0 ? (
        <div className="glass-lite glass-static flex flex-col items-start gap-2 p-5">
          <p className="m-0 text-[14px] font-semibold text-white">Nenhum criativo ainda.</p>
          <p className="m-0 text-[13px] text-ink-dim">Começa pelo campeão: cola a transcrição do criativo que mais tá vendendo e gera 10 variações dele.</p>
          <Link href="/criativos/novo" className="text-[13px] font-medium text-accent underline-offset-4 hover:underline">
            Novo criativo →
          </Link>
        </div>
      ) : (
        <div className="-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 pb-2">
          {STATUS.map((s) => (
            <section
              key={s.id}
              aria-label={s.nome}
              className="flex min-h-[200px] w-[78vw] max-w-[280px] shrink-0 snap-start flex-col gap-2 rounded-[18px] border border-line-soft bg-bg-raised/60 p-2.5 sm:w-[260px]"
            >
              <h2 className="flex items-center gap-2 px-1.5 pb-1 pt-0.5 text-[13px] font-semibold text-white">
                <span className="size-2 rounded-full" style={{ background: `rgb(var(--tag-${s.cor}))` }} />
                {s.nome}
                <span className="ml-auto text-[12px] font-normal tabular-nums text-ink-faint">{porStatus[s.id].length}</span>
              </h2>
              {porStatus[s.id].map((c) => (
                <Cartao key={c.id} c={c} onErro={setErro} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Cartao({ c, onErro }: { c: CriativoResumo; onErro: (e: string | null) => void }) {
  const [pendente, iniciar] = useTransition();
  return (
    <article className={cn("glass-lite glass-static flex flex-col gap-2 p-3", pendente && "opacity-60")}>
      <Link href={`/criativos/${c.id}`} className="text-[13.5px] font-semibold leading-snug text-white underline-offset-4 hover:underline">
        {c.titulo}
      </Link>
      {c.hook && <p className="m-0 line-clamp-3 text-[12px] leading-snug text-ink-dim">“{c.hook}”</p>}
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <Etiqueta cor={c.origem === "variacao" ? "roxo" : c.origem === "referencia" ? "azul" : c.origem === "organico" ? "laranja" : "cinza"}>{nomeOrigem(c.origem)}</Etiqueta>
        {c.variacoes > 0 && (
          <span className="flex items-center gap-1 tabular-nums text-ink-faint" title="Variações">
            <GitBranch size={12} aria-hidden /> {c.variacoes}
          </span>
        )}
        <select
          aria-label="Status"
          value={c.status}
          disabled={pendente}
          onChange={(e) => {
            const novo = e.target.value;
            iniciar(async () => {
              onErro(null);
              const r = await mudarStatus(c.id, novo);
              if (r.erro) onErro(r.erro);
            });
          }}
          className="ml-auto h-7 rounded-md border border-line-soft bg-transparent px-1.5 text-[12px] text-ink-dim hover:border-line focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {STATUS.map((s) => (
            <option key={s.id} value={s.id} className="bg-[#0a1418]">
              {s.nome}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}
