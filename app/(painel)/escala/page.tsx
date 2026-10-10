import { PainelOperacao } from "@/components/painel-operacao";
import { usuarioLogado } from "@/lib/auth/papeis";
import { carregarSemana } from "@/modulos/escala/dados";
import { horaCurta, inicioDaSemana, TOLERANCIA_ATRASO_MIN } from "@/modulos/escala/regras";
import { hojeSP } from "@/modulos/funil/calculo";
import Link from "next/link";
import { Suspense } from "react";
import { DiasDaSemana } from "./_componentes/dias";
import { FormPadrao } from "./_componentes/formularios";

// Check-in (endereço /escala). Contexto em docs/modulos/escala.md.
// De cima para baixo: "Entrei na operação" + quem está online; os 7 dias da semana atual com o
// horário fixo de cada um e o que aconteceu de verdade (entrou, saiu, atraso, saída automática).
// Admin: "Editar horários" (adicionar e tirar horário fixo) e corrigir entrada/saída com motivo.

type Props = { searchParams: Promise<{ editar?: string }> };

export default function CheckinPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight">Check-in</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Quem está na operação agora e, em cada dia da semana, o horário fixo ao lado do que aconteceu de verdade.</p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario) return null;
  const admin = usuario.papel === "admin";
  const hoje = hojeSP();
  const editar = admin && (await searchParams).editar === "1";
  const s = await carregarSemana(inicioDaSemana(hoje), usuario.id);
  // horário fixo de todos aparece para todos; entrada/saída e atraso dos outros, só para o admin
  const presencas = admin ? s.presencas : s.presencas.filter((p) => p.equipeId === s.eu);

  return (
    <>
      <PainelOperacao eu={s.eu} agora={s.agora} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft pb-2.5">
          <h2 className="text-[19px]">Esta semana</h2>
          {admin && (
            <span className="ml-auto flex items-center gap-3">
              <Link href="/escala/config" className="text-[12px] text-ink-dim underline-offset-4 hover:underline">
                Pessoas
              </Link>
              <Link
                href={editar ? "/escala" : "/escala?editar=1"}
                className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-bg-raised-2 hover:text-white"
              >
                {editar ? "Concluir edição" : "Editar horários"}
              </Link>
            </span>
          )}
        </div>

        {editar && (
          <div className="rounded-2xl border border-line-soft bg-bg-raised p-4">
            <p className="m-0 mb-3 text-[12.5px] text-ink-dim">
              Adicione um horário fixo (marque os dias) ou use &quot;tirar&quot; no card do dia. Tirar não apaga o passado: o que já valeu continua no histórico.
            </p>
            <FormPadrao pessoas={s.pessoas.map((p) => ({ id: p.id, nome: p.nome }))} operacao={s.operacao} hoje={hoje} />
          </div>
        )}

        <DiasDaSemana dias={s.dias} presencas={presencas} hoje={hoje} admin={admin} editar={editar} />
        <p className="m-0 text-[11.5px] text-ink-faint">
          Operação das {horaCurta(s.operacao.inicio)} às {horaCurta(s.operacao.fim)}. Atraso = entrou mais de {TOLERANCIA_ATRASO_MIN} min depois do horário fixo. Quem
          esquece de sair sai sozinho no fim do horário fixo (saída automática).
        </p>
      </section>
    </>
  );
}
