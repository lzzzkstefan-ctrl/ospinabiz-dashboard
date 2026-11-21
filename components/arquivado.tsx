import { ARQUIVADO_EM_BR } from "@/lib/arquivo";
import { Archive } from "lucide-react";
import Link from "next/link";

// Moldura das telas arquivadas (21/11/2026): a faixa no topo e a área "só leitura". O
// data-arquivado faz o globals.css desligar botões, campos e arrastar; o servidor recusa de novo
// (lib/arquivo.ts) e o banco também. Usada no layout.tsx de cada aba antiga.
export function MolduraArquivada({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div
        role="note"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line-soft bg-bg-raised px-4 py-2.5 text-[12.5px] print:hidden"
      >
        <Archive size={15} className="shrink-0 text-ink-faint" aria-hidden />
        <span className="font-medium text-white">
          {nome} · arquivado em {ARQUIVADO_EM_BR}
        </span>
        <span className="text-ink-dim">Só leitura. A operação do dia a dia está no Prime.</span>
        <Link href="/arquivado" className="ml-auto text-ink-dim underline-offset-4 hover:text-white hover:underline">
          ← Arquivado
        </Link>
      </div>
      <div data-arquivado>{children}</div>
    </div>
  );
}
