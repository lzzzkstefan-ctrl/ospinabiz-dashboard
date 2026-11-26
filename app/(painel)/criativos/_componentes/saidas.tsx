"use client";

// Como cada resposta da IA aparece na tela (o mesmo jeito na hora e no histórico), com os botões
// "Virar criativo" e "Copiar".

import { Button } from "@/components/ui/button";
import type { Analise, Hook, Ideias, Organico, Roteiro, SaidaPorModo, Separar, Variacoes } from "@/modulos/criativos/formatos";
import type { Modo } from "@/modulos/criativos/regras";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { aplicarRoteiro, virarCriativo, type NovoCriativo } from "../acoes";
import { Copiar } from "./ia";

function Titulo({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
      {children}
      {extra && <span className="ml-auto font-normal normal-case tracking-normal">{extra}</span>}
    </h3>
  );
}

function Bloco({ rotulo, texto }: { rotulo: string; texto: string }) {
  if (!texto) return null;
  return (
    <div>
      <p className="m-0 text-[11.5px] font-medium text-ink-faint">{rotulo}</p>
      <p className="m-0 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{texto}</p>
    </div>
  );
}

/** Cria um criativo com o que a IA gerou e mostra o link pra abrir. */
export function VirarCriativo({ dados, rotulo = "Virar criativo" }: { dados: NovoCriativo; rotulo?: string }) {
  const [pendente, iniciar] = useTransition();
  const [criado, setCriado] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (criado)
    return (
      <Link href={`/criativos/${criado}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[rgb(var(--tag-verde))] underline-offset-4 hover:underline">
        Criado · abrir <ArrowRight size={13} aria-hidden />
      </Link>
    );
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await virarCriativo(dados);
            if (r.erro) setErro(r.erro);
            else if (r.id) setCriado(r.id);
          })
        }
      >
        <Plus size={13} aria-hidden /> {pendente ? "Criando…" : rotulo}
      </Button>
      {erro && <span className="text-[12px] text-[rgb(var(--tag-vermelho))]">{erro}</span>}
    </span>
  );
}

function CartaoHook({ h, n, virar }: { h: Hook; n: number; virar?: NovoCriativo }) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line-soft bg-bg-raised/60 p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[11.5px] tabular-nums text-ink-faint">{n}</span>
        <span className="text-[11.5px] font-medium text-ink-dim">{h.angulo}</span>
      </div>
      <p className="m-0 text-[14px] font-semibold leading-snug text-white">{h.hook}</p>
      <p className="m-0 text-[13px] leading-snug text-ink-dim">{h.subhook}</p>
      <div className="flex flex-wrap items-center gap-2">
        {virar && <VirarCriativo dados={virar} />}
        <Copiar texto={`${h.hook}\n${h.subhook}`} />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Variações
// ---------------------------------------------------------------------------
export function SaidaVariacoes({ s, pai }: { s: Variacoes; pai: { id: number; titulo: string } }) {
  const lista = s.lista_gravacao.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const matrizTexto = s.matriz_visual
    .map((m, i) => `${i + 1}. ${m.roupa} · ${m.acessorio} · ${m.cenario} · ${m.enquadramento} · ${m.legenda} · 1º frame: ${m.primeiro_frame}`)
    .join("\n");
  return (
    <div className="flex flex-col gap-6">
      <section>
        <Titulo>Por que tá funcionando</Titulo>
        <p className="m-0 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{s.diagnostico}</p>
      </section>
      <section>
        <Titulo extra={<Copiar texto={s.hooks.map((h, i) => `${i + 1}. ${h.hook}\n   ${h.subhook}`).join("\n")} rotulo="Copiar todos" />}>
          {s.hooks.length} hooks novos (mesmo corpo)
        </Titulo>
        <ol className="grid gap-2 sm:grid-cols-2">
          {s.hooks.map((h, i) => (
            <CartaoHook
              key={i}
              h={h}
              n={i + 1}
              virar={{ titulo: `${pai.titulo} · V${i + 1}`, origem: "variacao", pai_id: pai.id, hook: h.hook, subhook: h.subhook, angulo: h.angulo, status: "gravar" }}
            />
          ))}
        </ol>
      </section>
      <section>
        <Titulo extra={<Copiar texto={matrizTexto} />}>Matriz visual (gravar em lote)</Titulo>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="text-ink-faint">
                {["#", "Roupa", "Acessório", "Cenário", "Enquadramento", "Legenda", "1º frame"].map((c) => (
                  <th key={c} className="border-b border-line-soft px-1.5 py-1.5 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.matriz_visual.map((m, i) => (
                <tr key={i} className="text-ink">
                  <td className="border-b border-line-soft px-1.5 py-1.5 tabular-nums text-ink-faint">{i + 1}</td>
                  {[m.roupa, m.acessorio, m.cenario, m.enquadramento, m.legenda, m.primeiro_frame].map((v, j) => (
                    <td key={j} className="border-b border-line-soft px-1.5 py-1.5">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <Titulo extra={<Copiar texto={lista} />}>Lista de gravação (30 min)</Titulo>
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[13.5px] leading-relaxed text-ink">
          {s.lista_gravacao.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ideias
// ---------------------------------------------------------------------------
export function SaidaIdeias({ s }: { s: Ideias }) {
  return (
    <ol className="flex flex-col gap-3">
      {s.ideias.map((x, i) => (
        <li key={i} className="flex flex-col gap-2.5 rounded-2xl border border-line-soft bg-bg-raised/60 p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-[11.5px] tabular-nums text-ink-faint">{i + 1}</span>
            <span className="text-[14.5px] font-semibold text-white">{x.titulo}</span>
            <span className="ml-auto text-[11.5px] text-ink-dim">{x.angulo}</span>
          </div>
          <Bloco rotulo="Conceito" texto={x.conceito} />
          <Bloco rotulo="Hook" texto={x.hook} />
          <Bloco rotulo="Subhook" texto={x.subhook} />
          <Bloco rotulo="Como gravar" texto={x.formato} />
          <Bloco rotulo="Por que pode funcionar" texto={x.por_que} />
          <div>
            <VirarCriativo dados={{ titulo: x.titulo, origem: "ideia_propria", angulo: x.angulo, formato: x.formato, hook: x.hook, subhook: x.subhook, status: "ideia" }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Roteiro
// ---------------------------------------------------------------------------
export function SaidaRoteiro({ s, criativoId }: { s: Roteiro; criativoId: number }) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const tudo = `${s.nome}\nÂngulo: ${s.angulo} · ${s.formato} · ${s.duracao_seg}s\n\nHOOK: ${s.hook}\nAlternativos:\n- ${s.hooks_alternativos.join("\n- ")}\nSUBHOOK: ${s.subhook}\n\n${s.roteiro}\n\nCTA: ${s.cta}`;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[14.5px] font-semibold text-white">
        {s.nome} <span className="text-[12px] font-normal text-ink-dim">· {s.angulo} · {s.duracao_seg}s</span>
      </p>
      <Bloco rotulo="Formato" texto={s.formato} />
      <Bloco rotulo="Hook" texto={s.hook} />
      <Bloco rotulo="Hooks alternativos" texto={s.hooks_alternativos.map((h) => `• ${h}`).join("\n")} />
      <Bloco rotulo="Subhook" texto={s.subhook} />
      <Bloco rotulo="Roteiro" texto={s.roteiro} />
      <Bloco rotulo="CTA" texto={s.cta} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await aplicarRoteiro(criativoId, { angulo: s.angulo, formato: s.formato, duracao_seg: s.duracao_seg, hook: s.hook, subhook: s.subhook, roteiro: s.roteiro, cta: s.cta });
              setAviso(r.erro ?? r.ok ?? null);
            })
          }
        >
          {pendente ? "Aplicando…" : "Usar neste criativo"}
        </Button>
        <Copiar texto={tudo} rotulo="Copiar roteiro" />
        {aviso && <span className="text-[12.5px] text-ink-dim">{aviso}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orgânico
// ---------------------------------------------------------------------------
export function SaidaOrganico({ s, pai }: { s: Organico; pai: { id: number; titulo: string } }) {
  return (
    <div className="flex flex-col gap-3">
      <Bloco rotulo="Hook (primeiros 2 s)" texto={s.hook} />
      <Bloco rotulo="Outras opções de hook" texto={s.hooks_alternativos.map((h) => `• ${h}`).join("\n")} />
      <Bloco rotulo="CTA de orgânico" texto={s.cta} />
      <Bloco rotulo="Como cortar pra 30–45 s" texto={s.como_cortar} />
      <Bloco rotulo="Legenda" texto={s.legenda} />
      <div className="flex flex-wrap items-center gap-2">
        <VirarCriativo
          rotulo="Salvar como criativo orgânico"
          dados={{ titulo: `${pai.titulo} · orgânico`, origem: "organico", pai_id: pai.id, hook: s.hook, cta: s.cta, formato: `Instagram 30–45 s. ${s.como_cortar}`.slice(0, 300), status: "gravar" }}
        />
        <Copiar texto={`${s.hook}\n\n${s.legenda}\n\n${s.cta}`} rotulo="Copiar hook + legenda + CTA" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Análise de referência
// ---------------------------------------------------------------------------
export function SaidaAnalise({ s, link, transcricao }: { s: Analise; link: string | null; transcricao: string }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <Titulo>O anúncio dele</Titulo>
        <Bloco rotulo="Hook" texto={s.hook} />
        <Bloco rotulo="Subhook" texto={s.subhook} />
        <Bloco rotulo="Ângulo" texto={s.angulo} />
        <Bloco rotulo="Promessa" texto={s.promessa} />
        <Bloco rotulo="Estrutura" texto={s.estrutura} />
        <Bloco rotulo="Formato" texto={s.formato} />
        <Bloco rotulo="Por que deve estar escalando" texto={s.por_que_escala} />
        <Bloco rotulo="O que dá pra adaptar (sem copiar)" texto={s.adaptacao} />
      </section>
      <section>
        <Titulo>{s.hooks_nossos.length} hooks nossos</Titulo>
        <ol className="grid gap-2">
          {s.hooks_nossos.map((h, i) => (
            <CartaoHook
              key={i}
              h={h}
              n={i + 1}
              virar={{ titulo: h.hook.slice(0, 80), origem: "referencia", hook: h.hook, subhook: h.subhook, angulo: h.angulo, referencia_link: link, referencia_transcricao: transcricao, status: "ideia" }}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Histórico: qualquer modo
// ---------------------------------------------------------------------------
export function SaidaQualquer({ modo, saida, criativo }: { modo: Modo; saida: unknown; criativo: { id: number; titulo: string } }) {
  const s = saida as SaidaPorModo[Modo] & { erro?: string };
  if (!saida || (s as { erro?: string }).erro) return <p className="m-0 text-[13px] text-ink-faint">Essa geração falhou (o gasto foi contado mesmo assim).</p>;
  if (modo === "variacoes") return <SaidaVariacoes s={saida as Variacoes} pai={criativo} />;
  if (modo === "roteiro") return <SaidaRoteiro s={saida as Roteiro} criativoId={criativo.id} />;
  if (modo === "organico") return <SaidaOrganico s={saida as Organico} pai={criativo} />;
  if (modo === "ideias") return <SaidaIdeias s={saida as Ideias} />;
  if (modo === "separar") {
    const x = saida as Separar;
    return (
      <div className="flex flex-col gap-2">
        <Bloco rotulo="Hook" texto={x.hook} />
        <Bloco rotulo="Subhook" texto={x.subhook} />
        <Bloco rotulo="Por que funciona" texto={x.por_que_funciona} />
      </div>
    );
  }
  // análise de referência ou formato desconhecido: texto cru
  return <pre className="m-0 overflow-x-auto whitespace-pre-wrap text-[12px] text-ink-dim">{JSON.stringify(saida, null, 2)}</pre>;
}
