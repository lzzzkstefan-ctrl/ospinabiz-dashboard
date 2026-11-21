"use client";

// Tela do Progresso: nível e XP, meta do dia, sequência, mapa de calor e a linha do tempo do que foi
// feito (com o que isso gerou). "Só eu" conta o que é seu; "Gestão" junta Davi e Rodrigo.

import { Aviso, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DadosProgresso } from "@/modulos/gestao/dados";
import {
  intensidade,
  META_DIA,
  nivelDe,
  NOME_ORIGEM,
  recadoDoDia,
  sequencia,
  TAMANHOS,
  TIPOS_REGISTRO,
  xpPorDia,
  type Evento,
  type Tamanho,
} from "@/modulos/gestao/progresso";
import { formatarBRL, segundaDa, somarDias } from "@/modulos/gestao/regras";
import { ArrowUpRight, Check, Flame, Plus, Trash2, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { apagarRegistro, registrar } from "../acoes";

type Quem = "eu" | "gestao";
const SEMANAS = 18;

function nomeDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return "Hoje";
  if (dia === somarDias(hoje, -1)) return "Ontem";
  const d = new Date(`${dia}T12:00:00Z`);
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(d).replace(".", "");
  return `${semana}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

function corDoEvento(e: Evento): string {
  if (e.tipo) return TIPOS_REGISTRO.find((t) => t.id === e.tipo)?.cor ?? "--tag-cinza";
  if (e.origem === "prioridade") return "--tag-laranja";
  if (e.origem === "decisao") return "--tag-azul";
  return "--tag-verde";
}

export function TelaProgresso({ dados, hoje }: { dados: DadosProgresso; hoje: string }) {
  const [quem, setQuem] = useState<Quem>("eu");
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [quantosDias, setQuantosDias] = useState(10);
  const linhaRef = useRef<HTMLElement>(null);

  const eventos = useMemo(() => dados.eventos.filter((e) => quem === "gestao" || e.meu), [dados.eventos, quem]);
  const porDia = useMemo(() => xpPorDia(eventos), [eventos]);
  const total = useMemo(() => eventos.reduce((s, e) => s + e.xp, 0), [eventos]);
  const nivel = nivelDe(total);
  const xpHoje = porDia.get(hoje) ?? 0;
  const itensHoje = eventos.filter((e) => e.dia === hoje).length;
  const seq = sequencia(porDia, hoje);

  const segunda = segundaDa(hoje);
  const xpEntre = (de: string, ate: string) => [...porDia].reduce((s, [d, x]) => (d >= de && d <= ate ? s + x : s), 0);
  const semanaAtual = xpEntre(segunda, hoje);
  // mesmo pedaço da semana passada (de segunda até o mesmo dia), pra comparar justo
  const semanaPassada = xpEntre(somarDias(segunda, -7), somarDias(hoje, -7));

  // dias com alguma coisa (eventos ou vendas), do mais novo pro mais velho; hoje sempre aparece
  const diasComCoisa = useMemo(() => {
    const s = new Set<string>([hoje, ...eventos.map((e) => e.dia), ...Object.keys(dados.vendasPorDia)]);
    return [...s].filter((d) => d <= hoje).sort((a, b) => (a < b ? 1 : -1));
  }, [eventos, dados.vendasPorDia, hoje]);
  const diasMostrados = diaAberto ? [diaAberto] : diasComCoisa.slice(0, quantosDias);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-line-soft p-1 text-[12.5px]" role="tablist" aria-label="De quem">
          {(
            [
              ["eu", "Só eu"],
              ["gestao", "Gestão"],
            ] as const
          ).map(([id, nome]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={quem === id}
              onClick={() => setQuem(id)}
              className={cn("rounded-full px-3.5 py-1.5 font-medium transition-colors", quem === id ? "bg-accent/15 text-white" : "text-ink-dim hover:text-white")}
            >
              {nome}
            </button>
          ))}
        </div>
        <p className="m-0 text-[12px] text-ink-faint">Conta sozinho: itens de Projetos (+10), prioridades (+50) e decisões (+20).</p>
      </div>

      {/* Placar */}
      <section className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="glass-lite glass-static flex flex-col justify-between gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="m-0 text-[12px] uppercase tracking-wide text-ink-faint">Nível {nivel.nivel}</p>
              <p className="m-0 mt-1 text-[24px] font-semibold leading-tight text-white">{nivel.nome}</p>
            </div>
            <span className="grid size-11 place-items-center rounded-full bg-accent/15 text-accent">
              <Trophy size={20} aria-hidden />
            </span>
          </div>
          <div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-bg-raised-2" role="progressbar" aria-valuemin={0} aria-valuemax={nivel.doNivel} aria-valuenow={nivel.noNivel} aria-label="XP do nível">
              <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, (nivel.noNivel / nivel.doNivel) * 100)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[12px] tabular-nums text-ink-dim">
              <span>
                {nivel.noNivel} / {nivel.doNivel} XP
              </span>
              <span>faltam {nivel.doNivel - nivel.noNivel} pro nível {nivel.nivel + 1}</span>
            </div>
          </div>
        </div>

        <div className="glass-lite glass-static flex items-center gap-4 p-5">
          <Anel valor={xpHoje} meta={META_DIA} />
          <div className="min-w-0">
            <p className="m-0 text-[12px] uppercase tracking-wide text-ink-faint">Hoje</p>
            <p className="m-0 mt-1 text-[13px] leading-snug text-ink">{recadoDoDia(xpHoje, itensHoje)}</p>
          </div>
        </div>

        <div className="glass-lite glass-static flex flex-col justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <span className={cn("grid size-11 place-items-center rounded-full", seq.dias > 0 ? "bg-[rgb(var(--tag-laranja)/0.15)] text-[rgb(var(--tag-laranja))]" : "bg-bg-raised-2 text-ink-faint")}>
              <Flame size={20} aria-hidden />
            </span>
            <div>
              <p className="m-0 text-[22px] font-semibold leading-none text-white tabular-nums">
                {seq.dias} {seq.dias === 1 ? "dia" : "dias"}
              </p>
              <p className="m-0 mt-1 text-[12px] text-ink-dim">{seq.dias === 0 ? "registra algo hoje pra começar" : seq.hojeConta ? "seguidos andando" : "seguidos · falta o de hoje"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-ink-dim">
            {semanaAtual >= semanaPassada ? <TrendingUp size={14} className="text-[rgb(var(--tag-verde))]" aria-hidden /> : <TrendingDown size={14} className="text-[rgb(var(--tag-vermelho))]" aria-hidden />}
            <span className="tabular-nums">
              Semana: <b className="font-semibold text-white">{semanaAtual} XP</b> · passada até hoje: {semanaPassada}
            </span>
          </div>
        </div>
      </section>

      <Registrar hoje={hoje} />

      {/* Mapa de calor */}
      <section className="glass-lite glass-static flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-[17px] font-semibold text-white">Últimas {SEMANAS} semanas</h2>
          {diaAberto ? (
            <button type="button" onClick={() => setDiaAberto(null)} className="text-[12px] text-accent hover:underline">
              Mostrar todos os dias
            </button>
          ) : (
            <span className="text-[12px] text-ink-faint">Toque num dia pra ver o que rolou</span>
          )}
        </div>
        <MapaDeCalor
          porDia={porDia}
          hoje={hoje}
          aberto={diaAberto}
          onDia={(d) => {
            setDiaAberto(d === diaAberto ? null : d);
            requestAnimationFrame(() => linhaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
          }}
        />
      </section>

      {/* Linha do tempo */}
      <section ref={linhaRef} className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="m-0 text-[17px] font-semibold text-white">Linha do tempo</h2>
        <ol className="flex flex-col gap-3">
          {diasMostrados.map((dia) => (
            <Dia key={dia} dia={dia} hoje={hoje} eventos={eventos.filter((e) => e.dia === dia)} vendas={dados.vendasPorDia[dia]} mostrarQuem={quem === "gestao"} />
          ))}
        </ol>
        {!diaAberto && diasComCoisa.length > quantosDias && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setQuantosDias((n) => n + 14)}>
            Ver dias anteriores
          </Button>
        )}
      </section>
    </div>
  );
}

function Anel({ valor, meta }: { valor: number; meta: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, valor / meta);
  const bateu = valor >= meta;
  return (
    <div className="relative grid size-[76px] shrink-0 place-items-center">
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--bg-raised-2)" strokeWidth="7" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={bateu ? "rgb(var(--tag-verde))" : "rgb(var(--accent-rgb))"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset .8s ease-out, stroke .3s" }}
        />
      </svg>
      <div className="text-center leading-none">
        {bateu ? <Check size={18} className="mx-auto text-[rgb(var(--tag-verde))]" aria-hidden /> : null}
        <span className="block text-[15px] font-semibold tabular-nums text-white">{valor}</span>
        <span className="block text-[10px] text-ink-faint">/ {meta} XP</span>
      </div>
    </div>
  );
}

function MapaDeCalor({ porDia, hoje, aberto, onDia }: { porDia: Map<string, number>; hoje: string; aberto: string | null; onDia: (d: string) => void }) {
  const inicio = somarDias(segundaDa(hoje), -7 * (SEMANAS - 1));
  const semanas = Array.from({ length: SEMANAS }, (_, s) => Array.from({ length: 7 }, (_, d) => somarDias(inicio, s * 7 + d)));
  const fundo = ["bg-bg-raised-2", "bg-accent/25", "bg-accent/45", "bg-accent/70", "bg-accent"];
  return (
    <div className="flex flex-col gap-2">
      <div className="no-scrollbar flex gap-[3px] overflow-x-auto pb-1">
        <div className="mr-1 grid grid-rows-7 gap-[3px] text-[9px] leading-none text-ink-faint" aria-hidden>
          {["seg", "", "qua", "", "sex", "", "dom"].map((n, i) => (
            <span key={i} className="flex h-[14px] items-center">
              {n}
            </span>
          ))}
        </div>
        {semanas.map((dias, s) => (
          <div key={s} className="grid grid-rows-7 gap-[3px]">
            {dias.map((dia) => {
              const futuro = dia > hoje;
              const xp = porDia.get(dia) ?? 0;
              return (
                <button
                  key={dia}
                  type="button"
                  disabled={futuro}
                  onClick={() => onDia(dia)}
                  title={`${dia.slice(8, 10)}/${dia.slice(5, 7)} · ${xp} XP`}
                  aria-label={`${dia.slice(8, 10)}/${dia.slice(5, 7)}: ${xp} XP`}
                  className={cn(
                    "size-[14px] rounded-[4px] transition-transform hover:scale-125",
                    futuro ? "opacity-0" : fundo[intensidade(xp)],
                    dia === hoje && "ring-1 ring-white/70",
                    aberto === dia && "ring-2 ring-white",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 self-end text-[11px] text-ink-faint" aria-hidden>
        menos
        {fundo.map((f) => (
          <span key={f} className={cn("size-[11px] rounded-[3px]", f)} />
        ))}
        mais
      </div>
    </div>
  );
}

function Dia({ dia, hoje, eventos, vendas, mostrarQuem }: { dia: string; hoje: string; eventos: Evento[]; vendas?: { vendas: number; liquido: number }; mostrarQuem: boolean }) {
  const xp = eventos.reduce((s, e) => s + e.xp, 0);
  const bateu = xp >= META_DIA;
  return (
    <li className="glass-lite glass-static flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="m-0 text-[15px] font-semibold text-white">{nomeDoDia(dia, hoje)}</h3>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[12px] font-semibold tabular-nums",
            bateu ? "bg-[rgb(var(--tag-verde)/0.15)] text-[rgb(var(--tag-verde))]" : xp > 0 ? "bg-accent/15 text-accent" : "bg-bg-raised-2 text-ink-faint",
          )}
        >
          {xp > 0 ? `+${xp} XP` : "0 XP"}
          {bateu && " · meta batida"}
        </span>
        {vendas && vendas.vendas > 0 && (
          <span className="rounded-full bg-[rgb(var(--tag-amarelo)/0.12)] px-2.5 py-0.5 text-[12px] font-medium text-[rgb(var(--tag-amarelo))]" title="Resultado da operação no dia (vendas pagas)">
            {vendas.vendas} {vendas.vendas === 1 ? "venda" : "vendas"} · {formatarBRL(vendas.liquido)} líquido
          </span>
        )}
      </header>
      {eventos.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-faint">{dia === hoje ? "Nada registrado ainda. Usa o campo lá em cima: até ajuste pequeno conta." : "Nenhum registro neste dia."}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {eventos.map((e) => (
            <ItemEvento key={e.chave} e={e} mostrarQuem={mostrarQuem} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ItemEvento({ e, mostrarQuem }: { e: Evento; mostrarQuem: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const tipoNome = e.tipo ? TIPOS_REGISTRO.find((t) => t.id === e.tipo)?.nome : NOME_ORIGEM[e.origem];
  return (
    <li className={cn("flex items-start gap-3", pendente && "opacity-50")}>
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: `rgb(var(${corDoEvento(e)}))` }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14px] leading-snug text-white">{e.titulo}</p>
        {e.resultado && (
          <p className="m-0 mt-0.5 text-[13px] leading-snug text-ink-dim">
            <span className="text-ink-faint">gerou: </span>
            {e.resultado}
          </p>
        )}
        <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-faint">
          <span>{tipoNome}</span>
          {e.origem !== "registro" && <span>· automático</span>}
          {mostrarQuem && e.quem && <span>· {e.quem}</span>}
          {e.link &&
            (e.link.startsWith("/") ? (
              <Link href={e.link} className="inline-flex items-center gap-0.5 text-accent hover:underline">
                abrir <ArrowUpRight size={11} aria-hidden />
              </Link>
            ) : (
              <a href={e.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
                link <ArrowUpRight size={11} aria-hidden />
              </a>
            ))}
        </p>
        {erro && <p className="m-0 mt-1 text-[12px] text-[rgb(var(--tag-vermelho))]">{erro}</p>}
      </div>
      <span className="shrink-0 font-mono text-[12.5px] font-semibold tabular-nums text-accent">+{e.xp}</span>
      {e.registroId != null && e.meu && (
        <button
          type="button"
          aria-label="Apagar registro"
          title="Apagar"
          disabled={pendente}
          onClick={() => {
            if (!confirm(`Apagar "${e.titulo}"?`)) return;
            iniciar(async () => {
              setErro(null);
              const r = await apagarRegistro(e.registroId!);
              if (r.erro) setErro(r.erro);
            });
          }}
          className="grid size-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-white"
        >
          <Trash2 size={13} />
        </button>
      )}
    </li>
  );
}

function Registrar({ hoje }: { hoje: string }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(registrar, {});
  const [aberto, setAberto] = useState(false);
  const [tamanho, setTamanho] = useState<Tamanho>("m");
  const [ganho, setGanho] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!estado.ok) return;
    setGanho(estado.ok);
    formRef.current?.reset();
    setTamanho("m");
    const t = setTimeout(() => setGanho(null), 1800);
    return () => clearTimeout(t);
  }, [estado]);

  return (
    <section className="glass-lite glass-static relative p-4">
      {ganho && (
        <span className="pointer-events-none absolute right-5 top-3 animate-[subirXp_1.8s_ease-out_forwards] rounded-full bg-[rgb(var(--tag-verde)/0.18)] px-3 py-1 text-[13px] font-semibold text-[rgb(var(--tag-verde))]" role="status">
          {ganho}
        </span>
      )}
      <form ref={formRef} action={acao} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            name="titulo"
            placeholder="O que você fez? Ex.: subi o onboarding novo do GCS"
            maxLength={160}
            required
            onFocus={() => setAberto(true)}
            className="h-11 text-[14px]"
          />
          {!aberto && (
            <Button type="button" onClick={() => setAberto(true)} className="h-11 shrink-0 gap-1.5">
              <Plus size={15} aria-hidden /> Registrar
            </Button>
          )}
        </div>
        {aberto && (
          <>
            <Input name="resultado" placeholder="O que isso gerou? Ex.: alunos novos se apresentam sozinhos (opcional)" maxLength={500} />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <select name="tipo" defaultValue="entrega" aria-label="Tipo" className={classeSelect}>
                {TIPOS_REGISTRO.map((t) => (
                  <option key={t.id} value={t.id} className={classeOpcao}>
                    {t.nome}
                  </option>
                ))}
              </select>
              <div className="inline-flex rounded-md border border-input p-0.5" role="radiogroup" aria-label="Tamanho">
                <input type="hidden" name="tamanho" value={tamanho} />
                {TAMANHOS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tamanho === t.id}
                    title={`${t.dica} · +${t.xp} XP`}
                    onClick={() => setTamanho(t.id)}
                    className={cn("rounded px-3 text-[13px] font-semibold transition-colors", tamanho === t.id ? "bg-accent/20 text-white" : "text-ink-dim hover:text-white")}
                  >
                    {t.nome} <span className="font-normal text-ink-faint">+{t.xp}</span>
                  </button>
                ))}
              </div>
              <Input type="date" name="data" defaultValue={hoje} max={hoje} aria-label="Dia" className="sm:w-[150px]" />
            </div>
            <Input name="link" type="url" placeholder="Link (opcional): PR, post, planilha…" maxLength={2000} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Salvando…" : "Registrar"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Fechar
              </Button>
              <Aviso estado={estado.erro ? estado : {}} />
            </div>
          </>
        )}
      </form>
    </section>
  );
}
