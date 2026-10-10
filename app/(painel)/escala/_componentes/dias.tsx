// Os 7 cards da semana atual (domingo a sábado) do Check-in: em cada dia, o horário fixo de cada
// pessoa e, embaixo, o que aconteceu de verdade (entrou às, saiu às, atraso, saída automática).
// Admin: "corrigir" em cada entrada; no modo editar, "tirar" em cada horário fixo.

import { Gaveta } from "@/components/formulario";
import { cn } from "@/lib/utils";
import { horaCurta, horas, NOME_DIA, TOLERANCIA_ATRASO_MIN, type DiaEscala, type Presenca } from "@/modulos/escala/regras";
import { encerrarPadrao } from "../acoes";
import { FormCorrigir } from "./formularios";

/** Cor fixa por pessoa (pelo id da equipe), das cores de etiqueta do tema. */
const CORES = ["--tag-azul", "--tag-verde", "--tag-roxo", "--tag-laranja", "--tag-vermelho"];
const corDaPessoa = (equipeId: number) => CORES[(Math.max(1, equipeId) - 1) % CORES.length];
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function DiasDaSemana({ dias, presencas, hoje, admin, editar }: { dias: DiaEscala[]; presencas: Presenca[]; hoje: string; admin: boolean; editar: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
      {dias.map((d) => {
        const ehHoje = d.dia === hoje;
        const descoberto = d.situacao === "descoberto";
        const doDia = presencas.filter((p) => p.dia === d.dia);
        // pessoas do dia: quem tem horário fixo e quem entrou mesmo sem horário fixo
        const ids = [...new Set([...d.entradas.map((e) => e.equipeId), ...doDia.map((p) => p.equipeId)])];
        const pessoas = ids
          .map((id) => ({
            id,
            nome: d.entradas.find((e) => e.equipeId === id)?.nome ?? doDia.find((p) => p.equipeId === id)?.nome ?? "?",
            fixos: d.entradas.filter((e) => e.equipeId === id),
            presenca: doDia.find((p) => p.equipeId === id) ?? null,
          }))
          .sort((a, b) => (a.fixos[0]?.inicio ?? "99").localeCompare(b.fixos[0]?.inicio ?? "99") || a.nome.localeCompare(b.nome));
        return (
          <div
            key={d.dia}
            className={cn(
              "flex flex-col gap-2.5 rounded-xl border p-3",
              ehHoje ? "border-accent/70 bg-accent/[0.06] shadow-[0_0_24px_rgba(147,186,222,0.12)]" : "border-line-soft",
              descoberto && "border-[rgb(var(--tag-vermelho)/0.6)] bg-[rgb(var(--tag-vermelho)/0.06)]",
              d.dia < hoje && !ehHoje && "opacity-75",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("text-[13.5px] font-semibold", ehHoje ? "text-accent" : "text-white")}>{NOME_DIA[d.diaSemana]}</span>
              <span className="text-[12px] tabular-nums text-ink-dim">{ehHoje ? "hoje · " : ""}{dataCurta(d.dia)}</span>
            </div>
            {descoberto && <p className="m-0 text-[12px] font-semibold text-[rgb(var(--tag-vermelho))]">ninguém fixo · descoberto</p>}
            {pessoas.map((p) => (
              <Pessoa key={p.id} pessoa={p} dia={d.dia} hoje={hoje} admin={admin} editar={editar} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Pessoa({
  pessoa: { id, nome, fixos, presenca },
  dia,
  hoje,
  admin,
  editar,
}: {
  pessoa: { id: number; nome: string; fixos: DiaEscala["entradas"]; presenca: Presenca | null };
  dia: string;
  hoje: string;
  admin: boolean;
  editar: boolean;
}) {
  const cor = corDaPessoa(id);
  const atraso = presenca?.atrasoMin != null && presenca.atrasoMin > TOLERANCIA_ATRASO_MIN ? presenca.atrasoMin : null;
  const naoEntrou = presenca?.situacao === "faltou";
  return (
    <div className="flex flex-col gap-0.5 border-t border-line-soft pt-2 text-[12.5px] first-of-type:border-t-0 first-of-type:pt-0">
      <span className="flex items-center gap-1.5 font-semibold text-white">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `rgb(var(${cor}))` }} aria-hidden />
        {nome}
      </span>
      {fixos.length ? (
        fixos.map((f) => (
          <span key={f.id} className="flex flex-wrap items-center gap-x-2 tabular-nums text-ink-dim">
            fixo {horaCurta(f.inicio)}–{horaCurta(f.fim)}
            {editar && admin && f.origem === "padrao" && (
              <form action={encerrarPadrao} className="inline">
                <input type="hidden" name="id" value={f.id} />
                <button type="submit" className="text-[11.5px] text-[rgb(var(--tag-vermelho))] underline-offset-4 hover:underline">
                  tirar
                </button>
              </form>
            )}
          </span>
        ))
      ) : (
        <span className="text-ink-faint">sem horário fixo</span>
      )}
      {/* o que aconteceu de verdade */}
      {presenca?.feito.map((f) => (
        <div key={f.checkinId} className="flex flex-col">
          <span className="tabular-nums text-ink">
            entrou {horaCurta(f.inicio)}
            {f.aberto ? (
              <span className="text-[rgb(var(--tag-verde))]"> · online agora</span>
            ) : (
              <>
                {" "}
                · saiu {horaCurta(f.fim)}
              </>
            )}
          </span>
          {f.auto && <span className="text-[11.5px] font-medium text-[rgb(var(--tag-laranja))]">saída automática</span>}
          {admin && !f.aberto && (
            <Gaveta rotulo="corrigir">
              <FormCorrigir id={f.checkinId} dia={dia} inicio={f.inicio} fim={f.fim} />
            </Gaveta>
          )}
        </div>
      ))}
      {atraso !== null && <span className="text-[11.5px] font-semibold text-[rgb(var(--tag-laranja))]">atraso {horas(atraso)}</span>}
      {naoEntrou && <span className="text-[11.5px] font-semibold text-[rgb(var(--tag-vermelho))]">{dia === hoje ? "ainda não entrou" : "não entrou"}</span>}
    </div>
  );
}
