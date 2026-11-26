"use client";

// Tela de um criativo: botões de IA no topo (Gerar variações em destaque), resultado da última geração,
// campos editáveis, variações filhas, venceu/perdeu e histórico de gerações.

import { Aviso, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Etiqueta } from "@/components/ui/etiqueta";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CriativoCompleto } from "@/modulos/criativos/dados";
import { dataHora, MODOS, nomeOrigem, nomeStatus, ORIGENS, reais, STATUS } from "@/modulos/criativos/regras";
import { FileText, Instagram, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { apagarCriativo, marcarResultado, mudarStatus, salvarCriativo } from "../acoes";
import { Copiar, ErroIA, Escrevendo, useGerar } from "./ia";
import { SaidaOrganico, SaidaQualquer, SaidaRoteiro, SaidaVariacoes } from "./saidas";

const classeTexto =
  "w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Secao({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {titulo}
        {extra && <span className="ml-auto font-normal normal-case tracking-normal">{extra}</span>}
      </h2>
      {children}
    </section>
  );
}

export function TelaCriativo({ dados, limiteBatido }: { dados: CriativoCompleto; limiteBatido: boolean }) {
  const { criativo: c, pai, filhos, geracoes, aprendizados } = dados;
  const base = { id: c.id, titulo: c.titulo };
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Etiqueta cor={STATUS.find((s) => s.id === c.status)!.cor}>{nomeStatus(c.status)}</Etiqueta>
          <Etiqueta>{nomeOrigem(c.origem)}</Etiqueta>
          {pai && (
            <Link href={`/criativos/${pai.id}`} className="text-ink-dim underline-offset-4 hover:underline">
              variação de “{pai.titulo}”
            </Link>
          )}
        </div>
        <h1 className="text-[24px] leading-tight">{c.titulo}</h1>
        {c.hook && <p className="m-0 text-[14px] leading-snug text-ink-dim">“{c.hook}”</p>}
      </header>

      <PainelIA dados={dados} limiteBatido={limiteBatido} />

      <Resultado id={c.id} status={c.status} aprendizados={aprendizados} />

      <Secao titulo="Roteiro e dados">
        {/* key: quando o roteiro gerado é aplicado, os campos mostram o que está salvo */}
        <Editor key={c.atualizado_em} dados={dados} />
      </Secao>

      <Secao titulo={`Variações (${filhos.length})`}>
        {filhos.length === 0 ? (
          <p className="m-0 text-[13px] text-ink-faint">Nenhuma ainda. Gera as variações lá em cima e clica em “Virar criativo” nas que você vai gravar.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {filhos.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2">
                <Link href={`/criativos/${f.id}`} className="min-w-0 flex-1 text-[13.5px] text-ink underline-offset-4 hover:underline">
                  <span className="block truncate font-medium text-white">{f.titulo}</span>
                  {f.hook && <span className="block truncate text-[12px] text-ink-dim">{f.hook}</span>}
                </Link>
                <StatusRapido id={f.id} status={f.status} />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo={`Histórico da IA (${geracoes.length})`}>
        {geracoes.length === 0 ? (
          <p className="m-0 text-[13px] text-ink-faint">Nada gerado pra esse criativo ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {geracoes.map((g) => (
              <li key={g.id}>
                <details className="group rounded-2xl border border-line-soft bg-bg-raised/40">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13px]">
                    <span className="font-medium text-white">{MODOS[g.modo]}</span>
                    <span className="text-ink-faint">{dataHora(g.criado_em)}</span>
                    <span className="ml-auto tabular-nums text-ink-faint">{reais(g.custo_estimado_brl)}</span>
                  </summary>
                  <div className="border-t border-line-soft px-4 py-4">
                    <SaidaQualquer modo={g.modo} saida={g.saida} criativo={base} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Apagar id={c.id} titulo={c.titulo} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------
function PainelIA({ dados, limiteBatido }: { dados: CriativoCompleto; limiteBatido: boolean }) {
  const c = dados.criativo;
  const base = { id: c.id, titulo: c.titulo };
  const variacoes = useGerar("variacoes");
  const organico = useGerar("organico");
  const roteiro = useGerar("roteiro");
  const ocupado = variacoes.pendente || organico.pendente || roteiro.pendente;
  const semCorpo = !c.corpo?.trim();
  const [ultimo, setUltimo] = useState<"variacoes" | "organico" | "roteiro" | null>(null);

  return (
    <section className="glass-lite glass-static flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="lg"
          className="px-5"
          disabled={ocupado || limiteBatido || semCorpo}
          onClick={() => {
            setUltimo("variacoes");
            variacoes.gerar({ criativo_id: c.id });
          }}
        >
          <Sparkles aria-hidden /> Gerar variações
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={ocupado || limiteBatido || (semCorpo && !c.roteiro_completo?.trim())}
          onClick={() => {
            setUltimo("organico");
            organico.gerar({ criativo_id: c.id });
          }}
        >
          <Instagram aria-hidden /> Versão orgânica
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={ocupado || limiteBatido}
          onClick={() => {
            setUltimo("roteiro");
            roteiro.gerar({ criativo_id: c.id });
          }}
        >
          <FileText aria-hidden /> Roteiro completo
        </Button>
      </div>
      <p className="m-0 text-[12.5px] text-ink-faint">
        {limiteBatido
          ? "Limite de gasto do mês batido: a IA volta no mês que vem."
          : semCorpo
            ? "Pra gerar variações, preenche o corpo (abaixo). As variações mantêm o corpo e trocam só hook e subhook."
            : "Variações: 10 hooks novos pro mesmo corpo, matriz visual e lista de gravação."}
      </p>
      {ocupado && <Escrevendo />}
      <ErroIA erro={variacoes.erro ?? organico.erro ?? roteiro.erro} />

      {ultimo === "variacoes" && variacoes.resultado && (
        <Gerado custo={variacoes.resultado.custo}>
          <SaidaVariacoes s={variacoes.resultado.saida} pai={base} />
        </Gerado>
      )}
      {ultimo === "organico" && organico.resultado && (
        <Gerado custo={organico.resultado.custo}>
          <SaidaOrganico s={organico.resultado.saida} pai={base} />
        </Gerado>
      )}
      {ultimo === "roteiro" && roteiro.resultado && (
        <Gerado custo={roteiro.resultado.custo}>
          <SaidaRoteiro s={roteiro.resultado.saida} criativoId={c.id} />
        </Gerado>
      )}
    </section>
  );
}

function Gerado({ custo, children }: { custo: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
      <p className="m-0 text-[12px] text-ink-faint">Custou ~{reais(custo)}. Fica salvo no histórico lá embaixo.</p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Venceu / perdeu
// ---------------------------------------------------------------------------
function Resultado({ id, status, aprendizados }: { id: number; status: string; aprendizados: CriativoCompleto["aprendizados"] }) {
  const [tipo, setTipo] = useState<"venceu" | "perdeu" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [estado, setEstado] = useState<EstadoForm>({});
  const [pendente, iniciar] = useTransition();
  return (
    <Secao titulo="Resultado">
      <div className="flex flex-wrap items-center gap-2">
        <StatusRapido id={id} status={status} />
        <Button type="button" variant={tipo === "venceu" ? "secondary" : "outline"} size="sm" onClick={() => setTipo(tipo === "venceu" ? null : "venceu")}>
          <ThumbsUp aria-hidden /> Venceu
        </Button>
        <Button type="button" variant={tipo === "perdeu" ? "secondary" : "outline"} size="sm" onClick={() => setTipo(tipo === "perdeu" ? null : "perdeu")}>
          <ThumbsDown aria-hidden /> Perdeu
        </Button>
      </div>
      {tipo && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              const r = await marcarResultado(id, tipo, motivo);
              setEstado(r);
              if (r.ok) {
                setTipo(null);
                setMotivo("");
              }
            });
          }}
        >
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            required
            autoFocus
            placeholder={tipo === "venceu" ? "Por que venceu? Ex.: hook de objeção (golpe) trouxe lead mais quente" : "Por que não deu? Ex.: hook genérico, CPL 2x a média"}
          />
          <Button type="submit" size="sm" disabled={pendente} className="h-9">
            {pendente ? "Salvando…" : "Salvar"}
          </Button>
        </form>
      )}
      <Aviso estado={estado} />
      {aprendizados.length > 0 && (
        <ul className="flex flex-col gap-1">
          {aprendizados.map((a) => (
            <li key={a.id} className="text-[13px] text-ink-dim">
              <span className={a.tipo === "venceu" ? "text-[rgb(var(--tag-verde))]" : "text-[rgb(var(--tag-vermelho))]"}>{a.tipo === "venceu" ? "Venceu" : "Perdeu"}</span>{" "}
              <span className="text-ink-faint">({dataHora(a.criado_em)})</span>: {a.motivo}
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-[12px] text-ink-faint">O motivo vira memória: a IA lê os últimos 20 antes de cada geração.</p>
    </Secao>
  );
}

function StatusRapido({ id, status }: { id: number; status: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label="Status"
        value={status}
        disabled={pendente}
        onChange={(e) => {
          const novo = e.target.value;
          iniciar(async () => {
            const r = await mudarStatus(id, novo);
            setErro(r.erro ?? null);
          });
        }}
        className={cn(classeSelect, "h-8 w-auto")}
      >
        {STATUS.map((s) => (
          <option key={s.id} value={s.id} className={classeOpcao}>
            {s.nome}
          </option>
        ))}
      </select>
      {erro && <span className="text-[12px] text-[rgb(var(--tag-vermelho))]">{erro}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------
function Campo({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
      <span>
        {rotulo}
        {dica && <span className="text-ink-faint"> · {dica}</span>}
      </span>
      {children}
    </label>
  );
}

function Editor({ dados }: { dados: CriativoCompleto }) {
  const c = dados.criativo;
  const m = c.metricas as { custo_por_lead?: string | null; conversas?: string | null; vendas?: string | null };
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarCriativo, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={c.id} />
      <Campo rotulo="Título">
        <Input name="titulo" defaultValue={c.titulo} maxLength={160} required />
      </Campo>
      <Campo rotulo="Hook" dica="o motivo pra parar de rolar">
        <textarea name="hook" defaultValue={c.hook ?? ""} maxLength={1000} rows={2} className={classeTexto} />
      </Campo>
      <Campo rotulo="Subhook" dica="o motivo pra continuar assistindo">
        <textarea name="subhook" defaultValue={c.subhook ?? ""} maxLength={1000} rows={2} className={classeTexto} />
      </Campo>
      <Campo rotulo="Corpo" dica="o que fica igual nas variações">
        <textarea name="corpo" defaultValue={c.corpo ?? ""} maxLength={20000} rows={8} className={classeTexto} />
      </Campo>
      <Campo rotulo="CTA">
        <textarea name="cta" defaultValue={c.cta ?? ""} maxLength={1000} rows={2} className={classeTexto} />
      </Campo>

      <details className="group">
        <summary className="cursor-pointer list-none text-[12.5px] font-medium text-ink-dim hover:text-white">Mais campos (ângulo, formato, roteiro, referência, métricas) ▾</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Campo rotulo="Origem">
              <select name="origem" defaultValue={c.origem} className={classeSelect}>
                {ORIGENS.map((o) => (
                  <option key={o.id} value={o.id} className={classeOpcao}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Duração (s)">
              <Input type="number" name="duracao_seg" min={1} max={600} defaultValue={c.duracao_seg ?? ""} />
            </Campo>
            <Campo rotulo="Ângulo">
              <Input name="angulo" defaultValue={c.angulo ?? ""} maxLength={300} />
            </Campo>
            <Campo rotulo="Formato">
              <Input name="formato" defaultValue={c.formato ?? ""} maxLength={300} placeholder="selfie no carro" />
            </Campo>
          </div>
          <Campo rotulo="Roteiro completo">
            <textarea name="roteiro_completo" defaultValue={c.roteiro_completo ?? ""} maxLength={30000} rows={8} className={classeTexto} />
          </Campo>
          <Campo rotulo="Link da referência">
            <Input name="referencia_link" defaultValue={c.referencia_link ?? ""} maxLength={2000} placeholder="https://…" />
          </Campo>
          <Campo rotulo="Transcrição da referência">
            <textarea name="referencia_transcricao" defaultValue={c.referencia_transcricao ?? ""} maxLength={30000} rows={3} className={classeTexto} />
          </Campo>
          <div className="grid grid-cols-3 gap-2">
            <Campo rotulo="Custo por lead">
              <Input name="m_custo_por_lead" defaultValue={m.custo_por_lead ?? ""} maxLength={40} placeholder="R$ 4,20" />
            </Campo>
            <Campo rotulo="Conversas">
              <Input name="m_conversas" defaultValue={m.conversas ?? ""} maxLength={40} />
            </Campo>
            <Campo rotulo="Vendas">
              <Input name="m_vendas" defaultValue={m.vendas ?? ""} maxLength={40} />
            </Campo>
          </div>
          <Campo rotulo="Notas de resultado">
            <textarea name="resultado_notas" defaultValue={c.resultado_notas ?? ""} maxLength={4000} rows={3} className={classeTexto} />
          </Campo>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Copiar texto={[c.hook, c.subhook, c.corpo, c.cta].filter(Boolean).join("\n\n")} rotulo="Copiar texto pra gravar" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

function Apagar({ id, titulo }: { id: number; titulo: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3 border-t border-line-soft pt-4">
      <button
        type="button"
        disabled={pendente}
        onClick={() => {
          if (!confirm(`Apagar "${titulo}"? As variações ficam, soltas. Não tem como desfazer.`)) return;
          iniciar(async () => {
            const r = await apagarCriativo(id);
            if (r.erro) setErro(r.erro);
            else router.push("/criativos");
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-[rgb(var(--tag-vermelho))]"
      >
        <Trash2 size={13} aria-hidden /> Apagar criativo
      </button>
      {erro && <span className="text-[12px] text-[rgb(var(--tag-vermelho))]">{erro}</span>}
    </div>
  );
}
