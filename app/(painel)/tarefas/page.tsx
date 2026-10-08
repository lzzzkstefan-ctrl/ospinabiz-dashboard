import { Etiqueta } from "@/components/ui/etiqueta";
import { cn } from "@/lib/utils";
import { listarOpcoes, listarTarefas, type OpcoesTarefa } from "@/modulos/tarefas/dados";
import {
  FILTROS,
  contarPorFiltro,
  estaAtrasada,
  filtrarTarefas,
  formatarData,
  hojeEmSaoPaulo,
  lerFiltro,
  textoVinculo,
  type Filtro,
  type Tarefa,
} from "@/modulos/tarefas/regras";
import Link from "next/link";
import { Suspense } from "react";
import { BotaoConcluir } from "./_componentes/botao-concluir";
import { EditarTarefa } from "./_componentes/form-editar-tarefa";
import { FormNovaTarefa } from "./_componentes/form-nova-tarefa";

type Props = { searchParams: Promise<{ filtro?: string | string[] }> };

// Tarefas da operação: criar, concluir e filtrar. Qualquer usuário logado usa.
export default function TarefasPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] leading-tight">Tarefas</h1>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <ConteudoTarefas searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ConteudoTarefas({ searchParams }: Props) {
  const [{ filtro: filtroBruto }, tarefas, opcoes] = await Promise.all([searchParams, listarTarefas(), listarOpcoes()]);
  const filtro = lerFiltro(filtroBruto);
  const hoje = hojeEmSaoPaulo();
  const contagem = contarPorFiltro(tarefas, hoje);
  const lista = filtrarTarefas(tarefas, filtro, hoje);

  return (
    <>
      <FormNovaTarefa opcoes={opcoes} />

      <nav className="flex flex-wrap gap-1.5 border-b border-line-soft pb-3" aria-label="Filtro de tarefas">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "pendentes" ? "/tarefas" : `/tarefas?filtro=${f.id}`}
            aria-current={filtro === f.id ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors",
              filtro === f.id ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
            )}
          >
            {f.nome} <span className="tabular-nums text-ink-faint">{contagem[f.id]}</span>
          </Link>
        ))}
      </nav>

      {lista.length === 0 ? (
        <p className="text-[13.5px] text-ink-faint">{VAZIO[filtro]}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((t) => (
            <LinhaTarefa key={t.id} tarefa={t} hoje={hoje} opcoes={opcoes} />
          ))}
        </ul>
      )}
    </>
  );
}

const VAZIO: Record<Filtro, string> = {
  pendentes: "Nenhuma tarefa pendente.",
  atrasadas: "Nenhuma tarefa atrasada.",
  concluidas: "Nenhuma tarefa concluída ainda.",
};

function LinhaTarefa({ tarefa, hoje, opcoes }: { tarefa: Tarefa; hoje: string; opcoes: OpcoesTarefa }) {
  const concluida = tarefa.status === "concluida";
  const atrasada = estaAtrasada(tarefa, hoje);
  const vinculo = textoVinculo(tarefa);

  return (
    <li className="glass-lite glass-static flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <BotaoConcluir id={tarefa.id} concluida={concluida} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[14px]", concluida ? "text-ink-faint line-through" : "text-white")}>{tarefa.titulo}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
          <span>{tarefa.responsavel?.nome ?? "sem responsável"}</span>
          {tarefa.prazo &&
            (atrasada ? (
              <Etiqueta cor="vermelho">atrasada · {formatarData(tarefa.prazo, hoje)}</Etiqueta>
            ) : (
              <span>prazo {formatarData(tarefa.prazo, hoje)}</span>
            ))}
          {vinculo && <Etiqueta cor="azul">{vinculo}</Etiqueta>}
          {concluida && tarefa.concluida_em && (
            <span>concluída {formatarData(tarefa.concluida_em.slice(0, 10), hoje)}</span>
          )}
        </div>
      </div>
      <EditarTarefa tarefa={tarefa} opcoes={opcoes} />
    </li>
  );
}
