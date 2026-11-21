import { usuarioLogado } from "@/lib/auth/papeis";
import { carregarProgresso } from "@/modulos/gestao/dados";
import { hojeSP } from "@/modulos/gestao/regras";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TelaProgresso } from "./_componentes/progresso";

// Progresso (21/11/2026): diário do que foi feito e do que isso gerou, com XP, nível, meta do dia,
// sequência e mapa de calor. Pra ver que as coisas estão andando. Só a gestão (proxy.ts + RLS).
export default function ProgressoPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] leading-tight">Progresso</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">O que foi feito, dia a dia, e o que isso gerou.</p>
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
  const hoje = hojeSP();
  const dados = await carregarProgresso(hoje, usuario.id);
  return <TelaProgresso dados={dados} hoje={hoje} />;
}
