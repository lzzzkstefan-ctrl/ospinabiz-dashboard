import { usuarioLogado } from "@/lib/auth/papeis";
import { carregarCriativo, gastoDoMes } from "@/modulos/criativos/dados";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TelaCriativo } from "../_componentes/criativo";
import { GastoDoMes } from "../_componentes/gasto";

// Um criativo: Gerar variações (principal), Versão orgânica, Roteiro completo, campos editáveis,
// variações filhas, venceu/perdeu e histórico de gerações. Só a gestão.
type Props = { params: Promise<{ id: string }> };

export default function CriativoPage({ params }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/criativos" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
        ← Criativos
      </Link>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando…</p>}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario?.gestao) notFound();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [dados, gasto] = await Promise.all([carregarCriativo(Number(id)), gastoDoMes()]);
  if (!dados) notFound();
  return (
    <>
      <GastoDoMes gasto={gasto} />
      {/* key: trocar de criativo (link de variação) zera o que foi digitado e gerado */}
      <TelaCriativo key={dados.criativo.id} dados={dados} limiteBatido={gasto.estourou} />
    </>
  );
}
