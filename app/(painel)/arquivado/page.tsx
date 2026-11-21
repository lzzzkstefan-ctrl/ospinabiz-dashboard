import { ABAS_ARQUIVADAS, ARQUIVADO_EM_BR, ROTINAS_DESLIGADAS } from "@/lib/arquivo";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

// Arquivado (21/11/2026): as abas da operação, que passou para o Prime. Cada card abre a tela antiga
// em modo leitura. Só a gestão (o proxy confere). Contexto em docs/modulos/arquivado.md.
export default function ArquivadoPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="max-w-2xl">
        <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-ink-faint">Desde {ARQUIVADO_EM_BR}</p>
        <h1 className="text-[28px] leading-tight">Arquivado</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">
          A operação do dia a dia passou para o Prime. As telas antigas continuam aqui para consulta, com os dados como estavam no dia do
          arquivamento. Nada foi apagado.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ABAS_ARQUIVADAS.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="glass-lite group flex h-full flex-col gap-2 p-4 transition-colors hover:border-line"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold text-white">{a.nome}</span>
                <ArrowUpRight size={16} className="text-ink-faint transition-colors group-hover:text-white" aria-hidden />
              </span>
              <span className="text-[13px] leading-snug text-ink-dim">{a.descricao}</span>
              <span className="mt-auto pt-2 text-[11.5px] text-ink-faint">{a.tinhaTela ? "Abrir em leitura" : "Sem tela: só o aviso"}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="max-w-3xl">
        <h2 className="mb-1 text-[15px] font-semibold text-white">O que foi desligado</h2>
        <p className="m-0 mb-4 text-[12.5px] text-ink-dim">
          Rotinas que só serviam a essas abas. O aviso de venda e de reembolso, o webhook da Hubla e os lembretes de reembolso continuam ligados.
        </p>
        <dl className="divide-y divide-line-soft border-y border-line-soft">
          {ROTINAS_DESLIGADAS.map((r) => (
            <div key={r.nome} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,260px)_1fr] sm:gap-6">
              <dt className="text-[13px] font-medium text-white">{r.nome}</dt>
              <dd className="m-0 text-[13px] text-ink-dim">{r.fazia}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
