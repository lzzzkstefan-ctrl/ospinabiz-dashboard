import { usuarioLogado } from "@/lib/auth/papeis";
import { carregarIniciativas, listarFrentes, listarPessoas } from "@/modulos/gestao/dados";
import { hojeSP } from "@/modulos/gestao/regras";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Quadro } from "./_componentes/quadro";

// Projetos (fase 2, 21/11/2026): kanban por iniciativa; substitui Tarefas e Melhorias (arquivadas).
// ?i=<id> abre o painel da iniciativa (link do Hoje). Só a gestão (proxy.ts + RLS).
export default function ProjetosPage({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] leading-tight">Projetos</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Cada iniciativa com frente, dono, prazo e checklist. Arraste o cartão para mudar de coluna.</p>
      </header>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando…</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  const usuario = await usuarioLogado();
  if (!usuario?.gestao) notFound();
  const { i } = await searchParams;
  const [itens, frentes, pessoas] = await Promise.all([carregarIniciativas(usuario.id), listarFrentes(), listarPessoas()]);
  const abrir = i && /^\d+$/.test(i) ? Number(i) : null;
  return <Quadro itens={itens} frentes={frentes} pessoas={pessoas} hoje={hojeSP()} abrir={abrir} />;
}
