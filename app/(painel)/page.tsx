import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { carregarProgresso, decisoesPendentes, listarPessoas, numerosDaSemana, prazosDaSemana, prioridadesDaSemana, vendasDaSemana } from "@/modulos/gestao/dados";
import { dataCurta, diasAte, hojeSP, segundaDa, somarDias, textoPrazo } from "@/modulos/gestao/regras";
import { nomeNaEquipe, urlDaCapa } from "@/modulos/inicio/capa";
import { META_DIA, sequencia, xpPorDia } from "@/modulos/gestao/progresso";
import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Capa } from "./_componentes/capa";
import { Numeros } from "./_componentes/hoje/numeros";
import { Prioridades } from "./_componentes/hoje/prioridades";

// Hoje (central de gestão, fase 2 em 21/11/2026): capa GCS, prioridades da semana, números de vendas e
// líquido por lead x CPL, decisões pendentes e prazos dos projetos. Só a gestão abre (proxy.ts); quem
// não é vai para Vendas. Contexto em docs/modulos/gestao.md.
export default function HojePage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <ConteudoHoje />
    </Suspense>
  );
}

function saudacao(agora: Date): string {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(agora));
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

async function ConteudoHoje() {
  const usuario = await usuarioLogado();
  const agora = new Date();
  const hoje = hojeSP(agora);
  const semana = segundaDa(hoje);
  const [capa, nome, pessoas, prioridades, vendas, inv, pendentes, prazos] = await Promise.all([
    urlDaCapa(),
    usuario ? nomeNaEquipe(usuario.id) : Promise.resolve(null),
    listarPessoas(),
    prioridadesDaSemana(semana),
    vendasDaSemana(hoje),
    numerosDaSemana(semana),
    decisoesPendentes(),
    prazosDaSemana(hoje),
  ]);
  const dataHoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(agora);
  const nomeDe = (id: number | null) => pessoas.find((p) => p.id === id)?.nome ?? null;

  return (
    <>
      <div className="relative -mt-8 mb-10 pt-[270px] md:-mt-[112px]">
        <Capa url={capa} admin={usuario?.gestao ?? false} />
        <header className="relative z-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink-dim [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">{dataHoje}</p>
          <h1 className="mt-1 text-[28px] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
            {saudacao(agora)}
            {nome ? `, ${nome}` : ""}
          </h1>
        </header>
      </div>

      {usuario?.gestao && <SeuDia usuarioId={usuario.id} hoje={hoje} />}

      <Secao titulo="Prioridades da semana" detalhe={`${dataCurta(semana, hoje)} a ${dataCurta(somarDias(semana, 6), hoje)}`}>
        <Prioridades itens={prioridades} pessoas={pessoas} semana={semana} hoje={hoje} />
      </Secao>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <Secao titulo="Números" detalhe="vendas pagas, sem teste">
          <Numeros vendas={vendas} semana={semana} inv={inv} />
        </Secao>

        <div className="flex flex-col gap-10">
          <Secao titulo="Esperando decisão" link={{ href: "/decisoes", texto: "Decisões" }}>
            {pendentes.length === 0 ? (
              <Vazio>Nada pendente.</Vazio>
            ) : (
              <ul className="divide-y divide-line-soft border-y border-line-soft">
                {pendentes.slice(0, 6).map((d) => (
                  <li key={d.id}>
                    <Link href={`/decisoes?d=${d.id}`} className="flex items-baseline gap-3 py-2.5 text-[13.5px] transition-colors hover:text-white">
                      <span className="min-w-0 flex-1 text-ink">{d.decisao}</span>
                      <span className="shrink-0 text-[12px] text-ink-faint">{nomeDe(d.quem_id) ? `${nomeDe(d.quem_id)} decide` : "sem dono"}</span>
                    </Link>
                  </li>
                ))}
                {pendentes.length > 6 && <li className="py-2 text-[12px] text-ink-faint">e mais {pendentes.length - 6}</li>}
              </ul>
            )}
          </Secao>

          <Secao titulo="Prazos da semana" link={{ href: "/projetos", texto: "Projetos" }}>
            {prazos.length === 0 ? (
              <Vazio>Nenhum prazo nos próximos 7 dias.</Vazio>
            ) : (
              <ul className="divide-y divide-line-soft border-y border-line-soft">
                {prazos.slice(0, 8).map((p) => {
                  const atrasado = diasAte(p.prazo, hoje) < 0;
                  return (
                    <li key={`${p.tipo}-${p.id}`}>
                      <Link href={`/projetos?i=${p.iniciativaId}`} className="flex items-baseline gap-3 py-2.5 text-[13.5px] transition-colors hover:text-white">
                        <span className="min-w-0 flex-1">
                          <span className="text-ink">{p.titulo}</span>
                          {p.deQue && <span className="block truncate text-[12px] text-ink-faint">{p.deQue}</span>}
                        </span>
                        <span className="shrink-0 text-[12px] text-ink-faint">{nomeDe(p.quem_id) ?? ""}</span>
                        <span className={cn("w-[92px] shrink-0 text-right text-[12px] tabular-nums", atrasado ? "text-[rgb(var(--tag-vermelho))]" : "text-ink-dim")}>
                          {textoPrazo(p.prazo, hoje)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Secao>
        </div>
      </div>
    </>
  );
}

function Secao({ titulo, detalhe, link, children }: { titulo: string; detalhe?: string; link?: { href: string; texto: string }; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-white">{titulo}</h2>
        {detalhe && <span className="text-[12px] text-ink-faint">{detalhe}</span>}
        {link && (
          <Link href={link.href} className="ml-auto flex items-center gap-1 text-[12.5px] text-ink-dim transition-colors hover:text-white">
            {link.texto} <ArrowRight size={13} aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="m-0 border-y border-line-soft py-3 text-[13px] text-ink-faint">{children}</p>;
}

/** Faixa do Progresso no Hoje: XP do dia, meta e sequência. Se der erro, some (não derruba o Hoje). */
async function SeuDia({ usuarioId, hoje }: { usuarioId: string; hoje: string }) {
  let xp = 0;
  let dias = 0;
  try {
    const { eventos } = await carregarProgresso(hoje, usuarioId);
    const porDia = xpPorDia(eventos.filter((e) => e.meu));
    xp = porDia.get(hoje) ?? 0;
    dias = sequencia(porDia, hoje).dias;
  } catch (e) {
    console.error("[hoje] progresso:", e);
    return null;
  }
  const p = Math.min(100, (xp / META_DIA) * 100);
  return (
    <Link href="/progresso" className="glass-lite mb-10 flex flex-wrap items-center gap-x-5 gap-y-3 p-4 transition-colors hover:border-accent/50">
      <div className="min-w-[180px] flex-1">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-semibold text-white">Seu dia</span>
          <span className="tabular-nums text-ink-dim">
            {xp} / {META_DIA} XP
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-raised-2">
          <div className={cn("h-full rounded-full", xp >= META_DIA ? "bg-[rgb(var(--tag-verde))]" : "bg-accent")} style={{ width: `${Math.max(2, p)}%` }} />
        </div>
      </div>
      <span className="flex items-center gap-1.5 text-[13px] text-ink-dim">
        <Flame size={15} className={dias > 0 ? "text-[rgb(var(--tag-laranja))]" : "text-ink-faint"} aria-hidden />
        {dias} {dias === 1 ? "dia seguido" : "dias seguidos"}
      </span>
      <span className="flex items-center gap-1 text-[13px] font-medium text-accent">
        {xp === 0 ? "Registrar o que fiz" : "Ver progresso"} <ArrowRight size={14} aria-hidden />
      </span>
    </Link>
  );
}
