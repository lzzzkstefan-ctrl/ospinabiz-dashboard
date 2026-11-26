import { usuarioLogado } from "@/lib/auth/papeis";
import { gastoDoMes, listarCriativos } from "@/modulos/criativos/dados";
import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GastoDoMes } from "./_componentes/gasto";
import { ListaCriativos } from "./_componentes/lista";

// Criativos (fase 1, 26/11/2026): produzir criativo em volume (meta: 10 novos por semana), com a IA
// gerando variações do campeão, ideias, roteiros, versão orgânica e análise de referência.
// Só a gestão (proxy.ts + RLS). Contexto em docs/modulos/criativos.md.
export default function CriativosPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[28px] leading-tight">Criativos</h1>
          <p className="mt-1 text-[13.5px] text-ink-dim">Campeão vira 10 variações. Meta: 10 criativos novos por semana.</p>
        </div>
        <Link
          href="/criativos/novo"
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus size={15} aria-hidden /> Novo criativo
        </Link>
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
  const [itens, gasto] = await Promise.all([listarCriativos(), gastoDoMes()]);
  return (
    <>
      <GastoDoMes gasto={gasto} />
      <ListaCriativos itens={itens} />
    </>
  );
}
