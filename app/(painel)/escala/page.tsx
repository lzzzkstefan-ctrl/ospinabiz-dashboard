import { Gaveta } from "@/components/formulario";
import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { PainelOperacao } from "@/components/painel-operacao";
import { carregarSemana } from "@/modulos/escala/dados";
import { emBrasilia, horaCurta, horas, inicioDaSemana, NOME_DIA_CURTO, somarDias, TOLERANCIA_ATRASO_MIN, type Presenca } from "@/modulos/escala/regras";
import { hojeSP } from "@/modulos/funil/calculo";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarioSemana } from "./_componentes/calendario";
import { FormCorrigir } from "./_componentes/formularios";

// Check-in (endereço /escala). Contexto em docs/modulos/escala.md.
// Topo: "Entrei na operação" / "Sair da operação" e quem está online. Calendário da semana com o
// horário fixo (previsto) ao lado do que aconteceu (realizado). O admin define os horários fixos em
// /escala/config e corrige entrada/saída com motivo.

type Props = { searchParams: Promise<{ semana?: string }> };

export default function CheckinPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight">Check-in</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Quem está na operação agora e o horário fixo de cada um ao lado do que aconteceu de verdade.</p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario) return null;
  const admin = usuario.papel === "admin";
  const hoje = hojeSP();
  const sp = await searchParams;
  const domingo = inicioDaSemana(/^\d{4}-\d{2}-\d{2}$/.test(sp.semana ?? "") ? sp.semana! : hoje);
  const s = await carregarSemana(domingo, usuario.id);
  const agoraMin = emBrasilia(new Date().toISOString()).minuto;
  const presencasAteHoje = s.presencas.filter((p) => p.dia <= hoje && (admin || p.equipeId === s.eu));

  return (
    <>
      <PainelOperacao eu={s.eu} agora={s.agora} />

      <section className="glass-lite glass-static p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-white">
            Semana de {dataCurta(domingo)} a {dataCurta(somarDias(domingo, 6))}
          </h2>
          <nav className="flex gap-1 text-[12.5px]" aria-label="Semana">
            <Link href={`/escala?semana=${somarDias(domingo, -7)}`} className="rounded-full px-2.5 py-1 text-ink-dim hover:bg-bg-raised-2 hover:text-white">
              ← anterior
            </Link>
            <Link
              href="/escala"
              aria-current={domingo === inicioDaSemana(hoje) ? "page" : undefined}
              className={cn("rounded-full px-2.5 py-1 hover:bg-bg-raised-2 hover:text-white", domingo === inicioDaSemana(hoje) ? "bg-accent/15 text-white" : "text-ink-dim")}
            >
              hoje
            </Link>
            <Link href={`/escala?semana=${somarDias(domingo, 7)}`} className="rounded-full px-2.5 py-1 text-ink-dim hover:bg-bg-raised-2 hover:text-white">
              próxima →
            </Link>
          </nav>
          {admin && (
            <Link href="/escala/config" className="ml-auto text-[12px] text-ink-dim underline-offset-4 hover:underline">
              Horários fixos e pessoas
            </Link>
          )}
        </div>
        <CalendarioSemana dias={s.dias} presencas={s.presencas} hoje={hoje} agoraMin={agoraMin} />
        <p className="m-0 mt-2 text-[11.5px] text-ink-faint">
          Operação das {horaCurta(s.operacao.inicio)} às {horaCurta(s.operacao.fim)}. Atraso = entrou mais de {TOLERANCIA_ATRASO_MIN} min depois do horário fixo. Quem
          esquece de sair sai sozinho no fim do horário fixo (saída automática).
        </p>
      </section>

      <section className="glass-lite glass-static overflow-x-auto p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Previsto x realizado {admin ? "" : "(o seu)"}</h2>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">Dia a dia, até hoje.{admin && " O admin corrige entrada e saída com motivo (fica registrado)."}</p>
        <TabelaPresenca linhas={presencasAteHoje} admin={admin} />
      </section>
    </>
  );
}

const NOME_PRESENCA: Record<Presenca["situacao"], { texto: string; cor: "verde" | "laranja" | "vermelho" | "azul" | "cinza" }> = {
  ok: { texto: "ok", cor: "verde" },
  atrasou: { texto: "atrasou", cor: "laranja" },
  faltou: { texto: "não entrou", cor: "vermelho" },
  extra: { texto: "fora do horário fixo", cor: "azul" },
  em_andamento: { texto: "online", cor: "verde" },
  a_fazer: { texto: "ainda não começou", cor: "cinza" },
};

function TabelaPresenca({ linhas, admin }: { linhas: Presenca[]; admin: boolean }) {
  if (!linhas.length) return <p className="m-0 text-[13px] italic text-ink-faint">Nada previsto nem entrada registrada nesta semana até hoje.</p>;
  return (
    <table className="w-full border-collapse text-left text-[13px] tabular-nums">
      <thead className="text-[11.5px] text-ink-dim">
        <tr>
          <th className="py-1.5 pr-3 font-medium">Dia</th>
          <th className="py-1.5 pr-3 font-medium">Pessoa</th>
          <th className="py-1.5 pr-3 font-medium">Horário fixo</th>
          <th className="py-1.5 pr-3 font-medium">Entrou / saiu</th>
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
                        {f.auto && <span className="text-[rgb(var(--tag-laranja))]"> · saída automática</span>}
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
              {p.atrasoMin !== null && p.atrasoMin > TOLERANCIA_ATRASO_MIN && <span className="ml-2 text-[12px] text-[rgb(var(--tag-laranja))]">atraso {horas(p.atrasoMin)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
