"use client";

// Novo criativo, três caminhos: "Tenho um criativo campeão" (a IA separa hook, subhook e corpo; a pessoa
// confere e salva como No ar), "Quero ideias" (5 ideias) e "Analisar referência" (anúncio de outro player,
// colado à mão: a ferramenta não raspa a Biblioteca de Anúncios). E um atalho pra criar em branco.

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Separar } from "@/modulos/criativos/formatos";
import { Lightbulb, Search, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { criarEmBranco, virarCriativo } from "../acoes";
import { ErroIA, Escrevendo, useGerar } from "./ia";
import { SaidaAnalise, SaidaIdeias } from "./saidas";

const classeTexto =
  "w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Caminho = "campeao" | "ideias" | "referencia";
const CAMINHOS: { id: Caminho; nome: string; icone: typeof Trophy; dica: string }[] = [
  { id: "campeao", nome: "Tenho um criativo campeão", icone: Trophy, dica: "Cola a transcrição. A IA separa hook, subhook e corpo, você confere e salva." },
  { id: "ideias", nome: "Quero ideias", icone: Lightbulb, dica: "5 ideias com ângulos diferentes. A que você gostar vira criativo." },
  { id: "referencia", nome: "Analisar referência", icone: Search, dica: "Cola o link e a transcrição do anúncio de outro player. A IA explica por que escala e cria 3 hooks nossos." },
];

export function NovoCriativo({ limiteBatido }: { limiteBatido: boolean }) {
  const [caminho, setCaminho] = useState<Caminho>("campeao");
  const atual = CAMINHOS.find((c) => c.id === caminho)!;
  return (
    <div className="flex flex-col gap-5">
      <nav className="grid gap-2 sm:grid-cols-3" aria-label="Caminho">
        {CAMINHOS.map(({ id, nome, icone: Icone }) => (
          <button
            key={id}
            type="button"
            onClick={() => setCaminho(id)}
            aria-pressed={caminho === id}
            className={cn(
              "flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-[13.5px] font-medium transition-colors",
              caminho === id ? "border-accent/60 bg-accent/10 text-white" : "border-line-soft text-ink-dim hover:bg-bg-raised-2 hover:text-white",
            )}
          >
            <Icone size={16} aria-hidden /> {nome}
          </button>
        ))}
      </nav>
      <p className="m-0 text-[13px] text-ink-dim">{atual.dica}</p>
      {limiteBatido && <p className="m-0 text-[13px] text-[rgb(var(--tag-vermelho))]">Limite de gasto do mês batido: a IA volta no mês que vem. Dá pra criar em branco lá embaixo.</p>}

      {/* os três ficam montados pra não perder o que foi colado ao trocar de aba */}
      <div hidden={caminho !== "campeao"}>
        <Campeao limiteBatido={limiteBatido} />
      </div>
      <div hidden={caminho !== "ideias"}>
        <Ideias limiteBatido={limiteBatido} />
      </div>
      <div hidden={caminho !== "referencia"}>
        <Referencia limiteBatido={limiteBatido} />
      </div>

      <EmBranco />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Campeao({ limiteBatido }: { limiteBatido: boolean }) {
  const [transcricao, setTranscricao] = useState("");
  const ia = useGerar("separar");
  const [form, setForm] = useState<Separar | null>(null);
  const [salvando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  const resultado = ia.resultado;
  // resposta nova da IA vira o formulário pra conferir
  const [formDe, setFormDe] = useState<number | null>(null);
  if (resultado && formDe !== resultado.geracaoId) {
    setFormDe(resultado.geracaoId);
    setForm(resultado.saida);
  }

  const campo = (k: keyof Separar) => ({
    value: form?.[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f)),
  });

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Transcrição do criativo que tá vendendo
        <textarea value={transcricao} onChange={(e) => setTranscricao(e.target.value)} rows={8} maxLength={20000} className={classeTexto} placeholder="Cola aqui o texto falado do criativo, do começo ao fim." />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={ia.pendente || limiteBatido || !transcricao.trim()} onClick={() => ia.gerar({ texto: transcricao })}>
          Separar hook, subhook e corpo
        </Button>
        <span className="text-[12px] text-ink-faint">Leva uns segundos e custa centavos.</span>
      </div>
      {ia.pendente && <Escrevendo />}
      <ErroIA erro={ia.erro} />

      {form && (
        <form
          className="glass-lite glass-static flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              setErro(null);
              const r = await virarCriativo({
                titulo: form.titulo,
                origem: "ideia_propria",
                status: "no_ar",
                hook: form.hook,
                subhook: form.subhook,
                corpo: form.corpo,
                cta: form.cta,
                angulo: form.angulo,
                roteiro_completo: transcricao,
              });
              if (r.erro) setErro(r.erro);
              else if (r.id) router.push(`/criativos/${r.id}`);
            });
          }}
        >
          <p className="m-0 text-[13px] font-semibold text-white">Confere antes de salvar</p>
          {resultado && <p className="m-0 text-[12.5px] text-ink-dim">{resultado.saida.por_que_funciona}</p>}
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Título
            <Input {...campo("titulo")} maxLength={160} required />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Hook
            <textarea {...campo("hook")} rows={2} maxLength={1000} className={classeTexto} required />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Subhook
            <textarea {...campo("subhook")} rows={2} maxLength={1000} className={classeTexto} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Corpo
            <textarea {...campo("corpo")} rows={8} maxLength={20000} className={classeTexto} required />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            CTA
            <textarea {...campo("cta")} rows={2} maxLength={1000} className={classeTexto} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Ângulo
            <Input {...campo("angulo")} maxLength={300} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar como campeão (No ar)"}
            </Button>
            {erro && <span className="text-[12.5px] text-[rgb(var(--tag-vermelho))]">{erro}</span>}
          </div>
          <p className="m-0 text-[12px] text-ink-faint">Depois de salvar, abre a tela dele e clica em “Gerar variações”.</p>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Ideias({ limiteBatido }: { limiteBatido: boolean }) {
  const [direcao, setDirecao] = useState("");
  const ia = useGerar("ideias");
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Alguma direção? (opcional)
        <textarea
          value={direcao}
          onChange={(e) => setDirecao(e.target.value)}
          rows={3}
          maxLength={20000}
          className={classeTexto}
          placeholder="Ex.: foco em CLT de 12x36; ou cola frases reais de lead do WhatsApp pra virar hook."
        />
      </label>
      <div>
        <Button type="button" disabled={ia.pendente || limiteBatido} onClick={() => ia.gerar({ texto: direcao })}>
          Gerar 5 ideias
        </Button>
      </div>
      {ia.pendente && <Escrevendo />}
      <ErroIA erro={ia.erro} />
      {ia.resultado && <SaidaIdeias s={ia.resultado.saida} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Referencia({ limiteBatido }: { limiteBatido: boolean }) {
  const [link, setLink] = useState("");
  const [transcricao, setTranscricao] = useState("");
  const ia = useGerar("analise_referencia");
  // o que foi enviado (pra "Virar criativo" guardar a referência certa mesmo se a pessoa editar depois)
  const [enviado, setEnviado] = useState<{ link: string | null; transcricao: string }>({ link: null, transcricao: "" });
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Link do anúncio (Biblioteca de Anúncios)
        <Input value={link} onChange={(e) => setLink(e.target.value)} maxLength={2000} placeholder="https://www.facebook.com/ads/library/?id=…" />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Transcrição do anúncio
        <textarea value={transcricao} onChange={(e) => setTranscricao(e.target.value)} rows={8} maxLength={20000} className={classeTexto} placeholder="Cola o texto falado do anúncio." />
      </label>
      <div>
        <Button
          type="button"
          disabled={ia.pendente || limiteBatido || !transcricao.trim()}
          onClick={() => {
            const l = link.trim() || null;
            setEnviado({ link: l, transcricao });
            ia.gerar({ texto: transcricao, link: l ?? undefined });
          }}
        >
          Analisar
        </Button>
      </div>
      {ia.pendente && <Escrevendo />}
      <ErroIA erro={ia.erro} />
      {ia.resultado && <SaidaAnalise s={ia.resultado.saida} link={enviado.link} transcricao={enviado.transcricao} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function EmBranco() {
  const router = useRouter();
  const [estado, acao, pendente] = useActionState<EstadoForm & { id?: number }, FormData>(criarEmBranco, {});
  useEffect(() => {
    if (estado.id) router.push(`/criativos/${estado.id}`);
  }, [estado, router]);
  return (
    <details className="border-t border-line-soft pt-4">
      <summary className="cursor-pointer list-none text-[12.5px] font-medium text-ink-dim hover:text-white">Ou criar em branco, sem IA ▾</summary>
      <form action={acao} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input name="titulo" placeholder="Título do criativo" maxLength={160} required />
        <Button type="submit" variant="outline" disabled={pendente} className="h-9">
          Criar
        </Button>
      </form>
      <Aviso estado={estado.erro ? estado : {}} />
    </details>
  );
}
