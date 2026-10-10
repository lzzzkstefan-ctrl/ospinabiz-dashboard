// Calendário semanal do Check-in: dias em colunas (domingo a sábado), horas em linhas (8h às 24h).
// Cada pessoa do dia ganha uma faixa com dois blocos lado a lado, na cor dela:
//   claro (contorno) = horário fixo (previsto) · forte = entrou/saiu de verdade (realizado).
// Dia sem ninguém no horário fixo: fundo vermelho "descoberto"; horas da operação sem ninguém, tom
// vermelho claro. Linha vermelha = agora (só na semana de hoje).

import { cn } from "@/lib/utils";
import { horaCurta, horas, minutos, NOME_DIA_CURTO, TOLERANCIA_ATRASO_MIN, type DiaEscala, type Presenca } from "@/modulos/escala/regras";

const INICIO = 8 * 60;
const FIM = 24 * 60;
const PX_HORA = 44;
const ALTURA = ((FIM - INICIO) / 60) * PX_HORA;
const HORAS = Array.from({ length: (FIM - INICIO) / 60 }, (_, i) => 8 + i);

/** Cor fixa por pessoa (pelo id da equipe), das cores de etiqueta do tema. */
const CORES = ["--tag-azul", "--tag-verde", "--tag-roxo", "--tag-laranja", "--tag-vermelho"];
export const corDaPessoa = (equipeId: number) => CORES[(Math.max(1, equipeId) - 1) % CORES.length];

const y = (min: number) => ((Math.min(FIM, Math.max(INICIO, min)) - INICIO) / 60) * PX_HORA;
const altura = (ini: number, fim: number) => Math.max(2, y(fim) - y(ini));
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function CalendarioSemana({ dias, presencas, hoje, agoraMin }: { dias: DiaEscala[]; presencas: Presenca[]; hoje: string; agoraMin: number }) {
  const temHoje = dias.some((d) => d.dia === hoje);
  const pessoasDaSemana = [...new Map(presencas.map((p) => [p.equipeId, p.nome])).entries()].sort((a, b) => a[0] - b[0]);
  return (
    <div>
      {/* no celular a grade rola para o lado dentro do card (a página não) */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-[44px_repeat(7,minmax(0,1fr))]">
          {/* cabeçalho */}
          <div />
          {dias.map((d) => (
            <div key={d.dia} className={cn("border-b border-line-soft px-1 pb-1.5 text-center", d.dia === hoje && "text-white")}>
              <div className={cn("text-[12px] uppercase tracking-wide", d.dia === hoje ? "font-semibold text-accent" : "text-ink-dim")}>{NOME_DIA_CURTO[d.diaSemana]}</div>
              <div className={cn("text-[15px] tabular-nums", d.dia === hoje ? "font-semibold text-white" : "text-ink")}>{dataCurta(d.dia)}</div>
            </div>
          ))}

          {/* coluna das horas */}
          <div className="relative" style={{ height: ALTURA }}>
            {HORAS.map((h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10.5px] tabular-nums text-ink-faint" style={{ top: y(h * 60) }}>
                {h}h
              </span>
            ))}
            {temHoje && agoraMin >= INICIO && agoraMin < FIM && (
              <span className="absolute right-0.5 -translate-y-1/2 rounded bg-[rgb(var(--tag-vermelho))] px-1 text-[10px] font-semibold tabular-nums text-white" style={{ top: y(agoraMin) }}>
                {String(Math.floor(agoraMin / 60)).padStart(2, "0")}:{String(agoraMin % 60).padStart(2, "0")}
              </span>
            )}
          </div>

          {/* dias */}
          {dias.map((d) => {
            const doDia = presencas.filter((p) => p.dia === d.dia).sort((a, b) => a.equipeId - b.equipeId);
            const descoberto = d.situacao === "descoberto";
            return (
              <div
                key={d.dia}
                className={cn("relative border-l border-line-soft", descoberto && "bg-[rgb(var(--tag-vermelho)/0.09)]", d.dia === hoje && !descoberto && "bg-accent/[0.04]")}
                style={{ height: ALTURA }}
              >
                {/* linhas das horas */}
                {HORAS.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line-soft/60" style={{ top: y(h * 60) }} />
                ))}
                {/* horas da operação sem ninguém no horário fixo */}
                {!descoberto &&
                  d.descoberto.map((f) => (
                    <div
                      key={f.inicio}
                      className="absolute inset-x-0 bg-[rgb(var(--tag-vermelho)/0.08)]"
                      style={{ top: y(minutos(f.inicio)), height: altura(minutos(f.inicio), minutos(f.fim)) }}
                      title={`Sem ninguém: ${horaCurta(f.inicio)}–${horaCurta(f.fim)}`}
                    />
                  ))}
                {descoberto && (
                  <span className="absolute inset-x-0 top-[38%] text-center text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--tag-vermelho))]">
                    descoberto
                  </span>
                )}
                {/* uma faixa por pessoa: previsto (claro) | realizado (forte) */}
                {doDia.map((p, i) => {
                  const cor = corDaPessoa(p.equipeId);
                  const largura = 100 / doDia.length;
                  const atrasou = p.atrasoMin !== null && p.atrasoMin > TOLERANCIA_ATRASO_MIN;
                  return (
                    <div key={p.equipeId} className="absolute inset-y-0" style={{ left: `${i * largura}%`, width: `${largura}%` }}>
                      {p.escalado.map((f) => (
                        <div
                          key={`e-${f.inicio}`}
                          className="absolute left-[3px] right-1/2 overflow-hidden rounded-[5px] border px-1 py-0.5"
                          style={{
                            top: y(minutos(f.inicio)),
                            height: altura(minutos(f.inicio), minutos(f.fim)),
                            borderColor: `rgb(var(${cor}) / 0.7)`,
                            background: `rgb(var(${cor}) / 0.12)`,
                          }}
                          title={`${p.nome} · horário fixo ${horaCurta(f.inicio)}–${horaCurta(f.fim)}`}
                        >
                          <span className="block truncate text-[10.5px] font-semibold" style={{ color: `rgb(var(${cor}))` }}>
                            {p.nome}
                          </span>
                          <span className="block truncate text-[9.5px] tabular-nums text-ink-dim">
                            {horaCurta(f.inicio)}–{horaCurta(f.fim)}
                          </span>
                        </div>
                      ))}
                      {p.feito.map((f) => (
                        <div
                          key={`f-${f.checkinId}`}
                          className={cn("absolute left-1/2 right-[3px] overflow-hidden rounded-[5px] px-1 py-0.5", f.aberto && "rounded-b-none")}
                          style={{ top: y(minutos(f.inicio)), height: altura(minutos(f.inicio), minutos(f.fim)), background: `rgb(var(${cor}) / 0.85)` }}
                          title={`${p.nome} · entrou ${horaCurta(f.inicio)}${f.aberto ? " · online agora" : ` · saiu ${horaCurta(f.fim)}${f.auto ? " (saída automática)" : ""}`}`}
                        >
                          <span className="block truncate text-[9.5px] font-semibold tabular-nums text-[#0a1418]">
                            {horaCurta(f.inicio)}
                            {f.aberto ? " · agora" : `–${horaCurta(f.fim)}`}
                          </span>
                          {f.auto && <span className="block truncate text-[9px] font-medium text-[#0a1418]/80">saída automática</span>}
                        </div>
                      ))}
                      {atrasou && p.escalado[0] && (
                        <span
                          className="absolute left-1/2 right-[3px] -translate-y-full truncate text-center text-[9.5px] font-semibold text-[rgb(var(--tag-laranja))]"
                          style={{ top: y(minutos(p.feito[0]?.inicio ?? p.escalado[0].inicio)) }}
                        >
                          atraso {horas(p.atrasoMin!)}
                        </span>
                      )}
                    </div>
                  );
                })}
                {/* agora */}
                {d.dia === hoje && agoraMin >= INICIO && agoraMin < FIM && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-[rgb(var(--tag-vermelho))]" style={{ top: y(agoraMin) }}>
                    <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-[rgb(var(--tag-vermelho))]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* legenda */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-dim">
        {pessoasDaSemana.map(([id, nome]) => (
          <span key={id} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(var(${corDaPessoa(id)}))` }} /> {nome}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-ink-dim bg-ink-dim/10" /> horário fixo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-ink-dim" /> entrou/saiu de verdade
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-[rgb(var(--tag-vermelho)/0.25)]" /> sem ninguém
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-[rgb(var(--tag-vermelho))]" /> agora
        </span>
      </div>
    </div>
  );
}
