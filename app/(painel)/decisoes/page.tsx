import { usuarioLogado } from "@/lib/auth/papeis";
import { carregarDecisoes, listarFrentes, listarIniciativasCurtas, listarPessoas } from "@/modulos/gestao/dados";
import { hojeSP } from "@/modulos/gestao/regras";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TelaDecisoes } from "./_componentes/decisoes";

// Decisões (fase 2, 21/11/2026): registro das decisões e pauta da reunião semanal. ?d=<id> abre uma
// decisão (link do Hoje). Só a gestão (proxy.ts + RLS).
export default function DecisoesPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] leading-tight">Decisões</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">O que foi decidido, por quê e por quem. E o que está esperando decisão.</p>
      </header>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando…</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const usuario = await usuarioLogado();
  if (!usuario?.gestao) notFound();
  const { d } = await searchParams;
  const [{ decisoes, pauta }, pessoas, frentes, iniciativas] = await Promise.all([carregarDecisoes(), listarPessoas(), listarFrentes(), listarIniciativasCurtas()]);
  return <TelaDecisoes decisoes={decisoes} pauta={pauta} pessoas={pessoas} frentes={frentes} iniciativas={iniciativas} hoje={hojeSP()} abrir={d && /^\d+$/.test(d) ? Number(d) : null} />;
}
