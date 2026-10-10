import { Gaveta } from "@/components/formulario";
import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { carregarSemana } from "@/modulos/escala/dados";
import { emBrasilia, horaCurta, horas, inicioDaSemana, NOME_DIA, NOME_DIA_CURTO, somarDias, type DiaEscala, type Presenca } from "@/modulos/escala/regras";
import { hojeSP } from "@/modulos/funil/calculo";
import Link from "next/link";
import { Suspense } from "react";
import { cancelarPlantao } from "./acoes";
import { BotaoTurno, FormCorrigir, FormDecidir, FormPlantao } from "./_componentes/formularios";

// Escala e check-in (fase 1). Contexto em docs/modulos/escala.md.
// Todos veem a escala e quem está atendendo agora; cada um faz o próprio check-in e pede plantão.
// O admin confirma plantões, corrige turnos e define a escala padrão (/escala/config).

type Props = { searchParams: Promise<{ semana?: string }> };

export default function EscalaPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight">Escala e check-in</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Quem cobre cada dia, plantões extras e o turno de verdade (começar e encerrar).</p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const horaDe = (iso: string) => {
  const m = emBrasilia(iso).minuto;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario) return null;
  const admin = usuario.papel === "admin";
  const hoje = hojeSP();
  const sp = await searchParams;
  const domingo = inicioDaSemana(/^\d{4}-\d{2}-\d{2}$/.test(sp.semana ?? "") ? sp.semana! : hoje);
  const s = await carregarSemana(domingo, hoje, usuario.id);
  const meuTurno = s.agora.find((a) => a.equipeId === s.eu) ?? null;
  const pedidos = s.plantoes.filter((p) => p.situacao === "pendente");
  const decididos = s.plantoes.filter((p) => p.situacao !== "pendente" && (admin || p.equipe_id === s.eu));
  const presencas = admin ? s.presencas : s.presencas.filter((p) => p.equipeId === s.eu);
  const pessoas = s.pessoas.map((p) => ({ id: p.id, nome: p.nome }));

  return (
    <>
      {/* meu turno + quem está atendendo agora */}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="glass-lite glass-static p-4">
          <h2 className="mb-2 text-[15px] font-semibold text-white">Meu turno</h2>
          {s.eu === null ? (
            <p className="m-0 text-[13px] text-ink-dim">Seu login ainda não está ligado a ninguém da equipe. Fale com o admin para poder fazer check-in.</p>
          ) : (
            <>
              <p className="m-0 mb-3 text-[13px] text-ink-dim">
                {meuTurno
                  ? `Em turno desde ${horaDe(meuTurno.desde)} (${meuTurno.tipo === "raspagem" ? "raspagem" : "normal"}).`
                  : "Fora de turno. Aperte ao começar a atender; a hora é a do servidor."}
              </p>
              <BotaoTurno aberto={!!meuTurno} />
            </>
          )}
        </div>
        <div className="glass-lite glass-static p-4">
          <h2 className="mb-2 text-[15px] font-semibold text-white">Atendendo agora · {s.agora.length}</h2>
          {s.agora.length === 0 ? (
            <p className="m-0 text-[13px] italic text-[rgb(var(--tag-laranja))]">Ninguém em turno agora.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {s.agora.map((a) => (
                <li key={a.checkinId} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <span className="h-2 w-2 rounded-full bg-[rgb(var(--tag-verde))]" aria-hidden />
                  <span className="text-white">{a.nome}</span>
                  <span className="tabular-nums text-ink-dim">desde {horaDe(a.desde)}</span>
                  {a.tipo === "raspagem" && <Etiqueta cor="roxo">raspagem</Etiqueta>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* escala da semana */}
      <section className="glass-lite glass-static p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-white">
            Semana de {dataCurta(domingo)} a {dataCurta(somarDias(domingo, 6))}
          </h2>
          <nav className="flex gap-1.5 text-[12.5px]" aria-label="Semana">
            <Link href={`/escala?semana=${somarDias(domingo, -7)}`} className="rounded-full px-2.5 py-1 text-ink-dim hover:text-white">
              ← anterior
            </Link>
            {domingo !== inicioDaSemana(hoje) && (
              <Link href="/escala" className="rounded-full px-2.5 py-1 text-ink-dim hover:text-white">
                esta semana
              </Link>
            )}
            <Link href={`/escala?semana=${somarDias(domingo, 7)}`} className="rounded-full px-2.5 py-1 text-ink-dim hover:text-white">
              próxima →
            </Link>
          </nav>
          {admin && (
            <Link href="/escala/config" className="ml-auto text-[12px] text-ink-dim underline-offset-4 hover:underline">
              Escala padrão e pessoas
            </Link>
          )}
        </div>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">
          Horário da operação: {horaCurta(s.operacao.inicio)}–{horaCurta(s.operacao.fim)}, todos os dias. Mostra a escala padrão e os plantões confirmados; pedido ainda não
          confirmado aparece apagado.
        </p>
        <div className="grid gap-2 md:grid-cols-7">
          {s.dias.map((d) => (
            <Dia key={d.dia} dia={d} hoje={hoje} admin={admin} pessoas={pessoas} operacao={s.operacao} podePedir={admin || s.eu !== null} />
          ))}
        </div>
      </section>

      {/* pedidos de plantão */}
      <section className="glass-lite glass-static p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Plantões extras · {pedidos.length} a confirmar</h2>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">
          Marque pelo &quot;+ vou ficar&quot; no dia da escala. O pedido fica pendente até o admin confirmar; enquanto isso, quem pediu pode cancelar.
        </p>
        {pedidos.length === 0 && decididos.length === 0 ? (
          <p className="m-0 text-[13px] italic text-ink-faint">Nenhum plantão de hoje em diante.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {[...pedidos, ...decididos].map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft py-2 text-[13.5px] last:border-b-0">
                <span className="w-24 tabular-nums text-ink-dim">
                  {NOME_DIA_CURTO[new Date(`${p.dia}T12:00:00Z`).getUTCDay()]} {dataCurta(p.dia)}
                </span>
                <span className="text-white">{p.nome}</span>
                <span className="tabular-nums text-ink-dim">
                  {horaCurta(p.inicio)}–{horaCurta(p.fim)}
                </span>
                {p.tipo === "raspagem" && <Etiqueta cor="roxo">raspagem</Etiqueta>}
                <Etiqueta cor={p.situacao === "confirmado" ? "verde" : p.situacao === "pendente" ? "laranja" : "cinza"}>
                  {p.situacao === "pendente" ? "a confirmar" : p.situacao}
                </Etiqueta>
                {p.motivo && <span className="text-[12px] text-ink-faint">({p.motivo})</span>}
                <span className="ml-auto">
                  {admin && p.situacao === "pendente" ? (
                    <FormDecidir id={p.id} />
                  ) : p.situacao === "pendente" && p.equipe_id === s.eu ? (
                    <form action={cancelarPlantao}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-[12px] text-ink-dim underline-offset-4 hover:underline">
                        cancelar
                      </button>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* presença */}
      <section className="glass-lite glass-static overflow-x-auto p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Presença da semana {admin ? "" : "(a sua)"}</h2>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">
          Escalado x realizado (check-in). Atraso conta depois de 10 min. Turno esquecido aberto fecha sozinho às {horaCurta(s.operacao.fim)} e aparece como
          &quot;automático&quot;.{admin && " O admin corrige o horário com motivo (fica registrado)."}
        </p>
        <TabelaPresenca linhas={presencas} admin={admin} />
      </section>
    </>
  );
}

const COR_SITUACAO = { coberto: "verde", parcial: "laranja", descoberto: "vermelho" } as const;

function Dia({
  dia: d,
  hoje,
  admin,
  pessoas,
  operacao,
  podePedir,
}: {
  dia: DiaEscala;
  hoje: string;
  admin: boolean;
  pessoas: { id: number; nome: string }[];
  operacao: { inicio: string; fim: string };
  podePedir: boolean;
}) {
  const passou = d.dia < hoje;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-2.5",
        d.dia === hoje ? "border-accent/60" : "border-line-soft",
        d.situacao === "descoberto" && !passou && "border-[rgb(var(--tag-vermelho)/0.6)] bg-[rgb(var(--tag-vermelho)/0.06)]",
        passou && "opacity-60",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-white">{NOME_DIA[d.diaSemana]}</span>
        <span className="text-[12px] tabular-nums text-ink-dim">{dataCurta(d.dia)}</span>
      </div>
      <Etiqueta cor={COR_SITUACAO[d.situacao]} className="self-start">
        {d.situacao === "descoberto" ? "DESCOBERTO" : d.situacao === "parcial" ? "parcial" : "coberto"}
      </Etiqueta>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
        {d.entradas.map((e) => (
          <li key={`${e.origem}-${e.id}`} className="flex flex-col">
            <span className="text-white">
              {e.nome}
              {e.origem === "plantao" && <span className="text-ink-faint"> · plantão</span>}
            </span>
            <span className="tabular-nums text-ink-dim">
              {horaCurta(e.inicio)}–{horaCurta(e.fim)}
              {e.tipo === "raspagem" && <span className="text-[rgb(var(--tag-roxo))]"> · raspagem</span>}
            </span>
          </li>
        ))}
        {d.pendentes.map((e) => (
          <li key={`p-${e.id}`} className="flex flex-col opacity-60">
            <span className="text-ink">
              {e.nome} <span className="text-[rgb(var(--tag-laranja))]">· a confirmar</span>
            </span>
            <span className="tabular-nums text-ink-dim">
              {horaCurta(e.inicio)}–{horaCurta(e.fim)}
              {e.tipo === "raspagem" && " · raspagem"}
            </span>
          </li>
        ))}
      </ul>
      {d.descoberto.length > 0 && d.entradas.length > 0 && (
        <p className="m-0 text-[12px] text-[rgb(var(--tag-laranja))]">
          sem ninguém: {d.descoberto.map((f) => `${horaCurta(f.inicio)}–${horaCurta(f.fim)}`).join(", ")}
        </p>
      )}
      {podePedir && (!passou || admin) && (
        <Gaveta rotulo="+ vou ficar">
          <FormPlantao dia={d.dia} hoje={hoje} operacao={operacao} admin={admin} pessoas={pessoas} />
        </Gaveta>
      )}
    </div>
  );
}

const NOME_PRESENCA: Record<Presenca["situacao"], { texto: string; cor: "verde" | "laranja" | "vermelho" | "azul" | "cinza" }> = {
  ok: { texto: "ok", cor: "verde" },
  atrasou: { texto: "atrasou", cor: "laranja" },
  faltou: { texto: "faltou", cor: "vermelho" },
  extra: { texto: "fora da escala", cor: "azul" },
  em_andamento: { texto: "em turno", cor: "verde" },
  a_fazer: { texto: "ainda não começou", cor: "cinza" },
};

function TabelaPresenca({ linhas, admin }: { linhas: Presenca[]; admin: boolean }) {
  if (!linhas.length) return <p className="m-0 text-[13px] italic text-ink-faint">Nada escalado nem check-in nesta semana até hoje.</p>;
  return (
    <table className="w-full border-collapse text-left text-[13px] tabular-nums">
      <thead className="text-[11.5px] text-ink-dim">
        <tr>
          <th className="py-1.5 pr-3 font-medium">Dia</th>
          <th className="py-1.5 pr-3 font-medium">Pessoa</th>
          <th className="py-1.5 pr-3 font-medium">Escalado</th>
          <th className="py-1.5 pr-3 font-medium">Realizado</th>
          <th className="py-1.5 pr-3 text-right font-medium">Horas</th>
          <th className="py-1.5 font-medium">Situação</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((p) => (
          <tr key={`${p.dia}-${p.equipeId}`} className="border-t border-line-soft align-top text-ink">
            <td className="whitespace-nowrap py-1.5 pr-3 text-ink-dim">
              {NOME_DIA_CURTO[new Date(`${p.dia}T12:00:00Z`).getUTCDay()]} {dataCurta(p.dia)}
            </td>
            <td className="py-1.5 pr-3 text-white">{p.nome}</td>
            <td className="whitespace-nowrap py-1.5 pr-3">{p.escalado.map((f) => `${horaCurta(f.inicio)}–${horaCurta(f.fim)}`).join(", ") || "—"}</td>
            <td className="py-1.5 pr-3">
              {p.feito.length === 0
                ? "—"
                : p.feito.map((f) => (
                    <div key={f.checkinId} className="flex flex-wrap items-center gap-2">
                      <span className="whitespace-nowrap">
                        {horaCurta(f.inicio)}–{f.aberto ? "agora" : horaCurta(f.fim)}
                        {f.auto && <span className="text-[rgb(var(--tag-laranja))]"> · automático</span>}
                        {f.tipo === "raspagem" && <span className="text-[rgb(var(--tag-roxo))]"> · raspagem</span>}
                      </span>
                      {admin && !f.aberto && (
                        <Gaveta rotulo="corrigir">
                          <FormCorrigir id={f.checkinId} dia={p.dia} inicio={f.inicio} fim={f.fim} />
                        </Gaveta>
                      )}
                    </div>
                  ))}
            </td>
            <td className="whitespace-nowrap py-1.5 pr-3 text-right">
              {horas(p.minutosFeitos)} <span className="text-ink-faint">de {horas(p.minutosEscalados)}</span>
            </td>
            <td className="whitespace-nowrap py-1.5">
              <Etiqueta cor={NOME_PRESENCA[p.situacao].cor}>{NOME_PRESENCA[p.situacao].texto}</Etiqueta>
              {p.atrasoMin !== null && p.atrasoMin > 0 && <span className="ml-2 text-[12px] text-ink-faint">entrou {horas(p.atrasoMin)} depois</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
