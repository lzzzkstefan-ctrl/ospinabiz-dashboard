import { usuarioLogado } from "@/lib/auth/papeis";
import { gastoDoMes } from "@/modulos/criativos/dados";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GastoDoMes } from "../_componentes/gasto";
import { NovoCriativo } from "../_componentes/novo";

// Novo criativo: campeão (separar e salvar), ideias ou análise de referência. Só a gestão.
export default function NovoCriativoPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/criativos" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
        ← Criativos
      </Link>
      <header>
        <h1 className="text-[28px] leading-tight">Novo criativo</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Por onde você quer começar?</p>
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
  const gasto = await gastoDoMes();
  return (
    <>
      <GastoDoMes gasto={gasto} />
      <NovoCriativo limiteBatido={gasto.estourou} />
    </>
  );
}
