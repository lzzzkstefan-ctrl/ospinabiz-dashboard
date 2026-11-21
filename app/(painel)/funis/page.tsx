import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { carregarMapa, listarMapas } from "@/modulos/gestao/dados";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CanvasFunil } from "./_componentes/canvas";

// Funis (fase 3, 21/11/2026): canvas com os funis desenhados (React Flow). ?m=<slug> escolhe o funil;
// sem ele abre a visão geral (como os funis se empilham). Só a gestão (proxy.ts + RLS).
// O Funil antigo (dados da Data Crazy) está em Arquivado.
type Props = { searchParams: Promise<{ m?: string }> };

export default function FunisPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[28px] leading-tight">Funis</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Como os funis se empilham e o desenho de cada um, bloco a bloco.</p>
      </header>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando…</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario?.gestao) notFound();
  const { m } = await searchParams;
  const mapas = await listarMapas();
  const mapa = mapas.find((x) => x.slug === m) ?? mapas.find((x) => x.slug === "geral") ?? mapas[0];
  if (!mapa) return <p className="text-[13.5px] text-ink-faint">Nenhum funil cadastrado.</p>;
  const { blocos, ligacoes } = await carregarMapa(mapa.id);
  return (
    <>
      <nav aria-label="Funis" className="no-scrollbar -mx-6 flex gap-1 overflow-x-auto px-6 md:mx-0 md:w-fit md:max-w-full md:rounded-full md:border md:border-line-soft md:bg-bg-raised md:p-1 md:px-1">
        {mapas.map((x) => (
          <Link
            key={x.id}
            href={x.slug === "geral" ? "/funis" : `/funis?m=${x.slug}`}
            aria-current={x.id === mapa.id ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
              x.id === mapa.id ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
            )}
          >
            {x.nome}
          </Link>
        ))}
      </nav>
      {/* key: trocar de funil recria o canvas (câmera e estado do zero) */}
      <CanvasFunil key={mapa.id} mapa={mapa} mapas={mapas} blocos={blocos} ligacoes={ligacoes} />
    </>
  );
}
