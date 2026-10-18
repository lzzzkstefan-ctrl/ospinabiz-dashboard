// Os 7 cards da semana atual (domingo a sábado) do Check-in: em cada dia, o horário fixo de cada
// pessoa e, embaixo, o que aconteceu de verdade (entrou às, saiu às, pausas, atraso, saída
// automática). Tempo online = entradas menos pausas. Pausa acima do limite: vermelho.
// Admin: "corrigir" em cada entrada; no modo editar, "tirar" em cada horário fixo.
// Feriado: etiqueta no topo; "não vai rodar" troca as pessoas por "Folga · feriado" (nada de não
// entrou, atraso nem descoberto); sem decisão: "Aguardando decisão do Rodrigo".
// Compromisso previsto (18/10/2026): em amarelo embaixo do horário fixo ("📅 fora 14h–16h · consulta");
// o período avisado não vira atraso nem "não entrou"; todos fora o dia inteiro = descoberto.

import { Gaveta } from "@/components/formulario";
import { cn } from "@/lib/utils";
import type { FeriadoDoDia } from "@/modulos/escala/dados";
import { horaCurta, horas, NOME_DIA, NOME_MOTIVO, textoCurtoCompromisso, TOLERANCIA_ATRASO_MIN, type Compromisso, type DiaEscala, type Presenca } from "@/modulos/escala/regras";
import { apagarFeriado, encerrarPadrao } from "../acoes";
import { corDaPessoa } from "./cores";
import { FormCorrigir } from "./formularios";
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function DiasDaSemana({
  dias,
  presencas,
  hoje,
  admin,
  editar,
  pausaLongaMin,
  feriados,
  compromissos = [],
  nomes,
}: {
  feriados: Record<string, FeriadoDoDia>;
  /** compromissos previstos da semana (não cancelados) */
  compromissos?: Compromisso[];
  dias: DiaEscala[];
  presencas: Presenca[];
  hoje: string;
  admin: boolean;
  editar: boolean;
  pausaLongaMin: number;
  /** nome de quem só aparece pelo compromisso (sem horário fixo nem entrada no dia) */
  nomes?: Map<number, string>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
      {dias.map((d) => {
        const ehHoje = d.dia === hoje;
        const feriado = feriados[d.dia] ?? null;
        const folga = feriado?.roda === false;
        const descoberto = d.situacao === "descoberto" && !folga;
        const doDia = presencas.filter((p) => p.dia === d.dia);
        const avisos = compromissos.filter((c) => c.data === d.dia);
        // pessoas do dia: quem tem horário fixo, quem entrou mesmo sem horário fixo e quem avisou compromisso
        const ids = [...new Set([...d.entradas.map((e) => e.equipeId), ...doDia.map((p) => p.equipeId), ...avisos.map((c) => c.pessoa)])];
        const pessoas = ids
          .map((id) => ({
            id,
            nome: d.entradas.find((e) => e.equipeId === id)?.nome ?? doDia.find((p) => p.equipeId === id)?.nome ?? nomes?.get(id) ?? "?",
            fixos: d.entradas.filter((e) => e.equipeId === id),
            presenca: doDia.find((p) => p.equipeId === id) ?? null,
            avisos: avisos.filter((c) => c.pessoa === id),
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
            {feriado && <EtiquetaFeriado feriado={feriado} passou={d.dia < hoje} admin={admin} editar={editar} />}
            {descoberto && (
              <p className="m-0 text-[12px] font-semibold text-[rgb(var(--tag-vermelho))]">{d.entradas.length ? "todos fora · descoberto" : "ninguém fixo · descoberto"}</p>
            )}
            {folga ? (
              <p className="m-0 text-[12.5px] font-semibold text-[rgb(var(--tag-rosa))]">Folga · feriado</p>
            ) : (
              pessoas.map((p) => <Pessoa key={p.id} pessoa={p} dia={d.dia} hoje={hoje} admin={admin} editar={editar} pausaLongaMin={pausaLongaMin} />)
            )}
          </div>
        );
      })}
    </div>
  );
}

function EtiquetaFeriado({ feriado: f, passou, admin, editar }: { feriado: FeriadoDoDia; passou: boolean; admin: boolean; editar: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-full border border-[rgb(var(--tag-rosa)/0.45)] bg-[rgb(var(--tag-rosa)/0.12)] px-2 py-0.5 text-[11.5px] font-semibold text-[rgb(var(--tag-rosa))]">
          🎉 Feriado · {f.nome}
          {f.teste ? " (teste)" : ""}
        </span>
        {editar && admin && f.manual && (
          <form action={apagarFeriado} className="inline">
            <input type="hidden" name="id" value={f.id} />
            <button type="submit" className="text-[11.5px] text-[rgb(var(--tag-vermelho))] underline-offset-4 hover:underline">
              apagar
            </button>
          </form>
        )}
      </span>
      {f.roda === true && <span className="text-[11.5px] font-medium text-[rgb(var(--tag-verde))]">Feriado · operação normal</span>}
      {f.roda === null && f.precisaDecidir && !passou && <span className="text-[11.5px] font-semibold text-[rgb(var(--tag-amarelo))]">Aguardando decisão do Rodrigo</span>}
    </div>
  );
}

function Pessoa({
  pessoa: { id, nome, fixos, presenca, avisos },
  dia,
  hoje,
  admin,
  editar,
  pausaLongaMin,
}: {
  pessoa: { id: number; nome: string; fixos: DiaEscala["entradas"]; presenca: Presenca | null; avisos: Compromisso[] };
  dia: string;
  hoje: string;
  admin: boolean;
  editar: boolean;
  pausaLongaMin: number;
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
      {avisos.map((c) => (
        <span key={c.id} className="text-[11.5px] font-medium tabular-nums text-[rgb(var(--tag-amarelo))]">
          📅 {textoCurtoCompromisso(c)}
          {c.motivo ? ` · ${c.motivo}` : ""}
        </span>
      ))}
      {/* o que aconteceu de verdade */}
      {presenca?.feito.map((f) => (
        <div key={f.checkinId} className="flex flex-col">
          <span className="tabular-nums text-ink">
            entrou {horaCurta(f.inicio)}
            {f.aberto ? (
              f.pausas.some((pa) => pa.aberta) ? (
                <span className="text-[rgb(var(--tag-amarelo))]"> · em pausa</span>
              ) : (
                <span className="text-[rgb(var(--tag-verde))]"> · online agora</span>
              )
            ) : (
              <>
                {" "}
                · saiu {horaCurta(f.fim)}
              </>
            )}
          </span>
          {f.auto && <span className="text-[11.5px] font-medium text-[rgb(var(--tag-laranja))]">saída automática</span>}
          {f.pausas.map((pa) => {
            const longa = pa.minutos > pausaLongaMin;
            return (
              <span
                key={pa.id}
                className={cn("text-[11.5px] tabular-nums", longa ? "font-semibold text-[rgb(var(--tag-vermelho))]" : "text-[rgb(var(--tag-amarelo))]")}
                title={pa.detalhe ?? undefined}
              >
                {pa.aberta ? `em pausa desde ${horaCurta(pa.inicio)}` : `pausa ${horaCurta(pa.inicio)}–${horaCurta(pa.fim)}`} · {NOME_MOTIVO[pa.motivo]}
                {pa.detalhe ? ` (${pa.detalhe})` : ""} · {horas(pa.minutos)}
                {longa ? " · longa" : ""}
                {pa.comSaida ? " · terminou com a saída" : ""}
              </span>
            );
          })}
          {admin && !f.aberto && (
            <Gaveta rotulo="corrigir">
              <FormCorrigir id={f.checkinId} dia={dia} inicio={f.inicio} fim={f.fim} />
            </Gaveta>
          )}
        </div>
      ))}
      {presenca && presenca.feito.length > 0 && (
        <span className="text-[11.5px] tabular-nums text-ink-dim">
          online {horas(presenca.minutosFeitos)}
          {presenca.minutosPausa > 0 && <span className="text-[rgb(var(--tag-amarelo))]"> · pausas {horas(presenca.minutosPausa)}</span>}
        </span>
      )}
      {atraso !== null && <span className="text-[11.5px] font-semibold text-[rgb(var(--tag-laranja))]">atraso {horas(atraso)}</span>}
      {naoEntrou && <span className="text-[11.5px] font-semibold text-[rgb(var(--tag-vermelho))]">{dia === hoje ? "ainda não entrou" : "não entrou"}</span>}
      {/* dia anterior ao primeiro check-in registrado: o check-in ainda não existia */}
      {presenca?.situacao === "antes" && <span className="text-[11.5px] text-ink-faint">—</span>}
    </div>
  );
}
