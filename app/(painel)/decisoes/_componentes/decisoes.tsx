"use client";

// Decisões (fase 2): registro (data, decisão, por quê, quem, frente/iniciativa, status) e a pauta da
// reunião semanal. Na reunião, cada item da pauta vira decisão, tarefa num projeto ou é descartado.

import { Aviso, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { PainelLateral } from "@/components/painel-lateral";
import { Button } from "@/components/ui/button";
import { Etiqueta, type CorEtiqueta } from "@/components/ui/etiqueta";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Decisao, Frente, ItemPauta, Pessoa } from "@/modulos/gestao/dados";
import { dataCurta, STATUS_DECISAO, type StatusDecisao } from "@/modulos/gestao/regras";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BotaoIcone } from "../../_componentes/hoje/prioridades";
import { adicionarPauta, apagarDecisao, apagarPauta, descartarPauta, mudarStatusDecisao, pautaParaTarefa, reabrirPauta, salvarDecisao } from "../acoes";

type IniciativaCurta = { id: number; titulo: string; frente_id: number | null };
type Opcoes = { pessoas: Pessoa[]; frentes: Frente[]; iniciativas: IniciativaCurta[]; hoje: string };
type Edicao = { decisao?: Decisao; pauta?: ItemPauta } | null;

const classeTexto =
  "w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const corStatus = (s: StatusDecisao) => STATUS_DECISAO.find((x) => x.id === s)!.cor as CorEtiqueta;

export function TelaDecisoes({ decisoes, pauta, abrir, ...op }: Opcoes & { decisoes: Decisao[]; pauta: ItemPauta[]; abrir: number | null }) {
  const [filtro, setFiltro] = useState<StatusDecisao | "todas">("todas");
  const [edicao, setEdicao] = useState<Edicao>(() => {
    const d = abrir ? decisoes.find((x) => x.id === abrir) : undefined;
    return d ? { decisao: d } : null;
  });
  const fechar = useCallback(() => {
    setEdicao(null);
    if (location.search) history.replaceState(null, "", location.pathname);
  }, []);
  const visiveis = filtro === "todas" ? decisoes : decisoes.filter((d) => d.status === filtro);
  const contagem = (s: StatusDecisao) => decisoes.filter((d) => d.status === s).length;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-[17px] font-semibold text-white">Registro</h2>
          {[{ id: "todas" as const, nome: "Todas", n: decisoes.length }, ...STATUS_DECISAO.map((s) => ({ ...s, n: contagem(s.id) }))].map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={filtro === s.id}
              onClick={() => setFiltro(s.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                filtro === s.id ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
              )}
            >
              {s.nome} <span className="tabular-nums text-ink-faint">{s.n}</span>
            </button>
          ))}
          <Button type="button" size="sm" className="ml-auto" onClick={() => setEdicao({})}>
            <Plus size={14} /> Nova decisão
          </Button>
        </div>

        {visiveis.length === 0 ? (
          <p className="m-0 border-y border-line-soft py-6 text-center text-[13px] text-ink-faint">
            {decisoes.length === 0 ? "Nenhuma decisão registrada ainda." : "Nada com esse status."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {visiveis.map((d) => (
              <LinhaDecisao key={d.id} d={d} op={op} onEditar={() => setEdicao({ decisao: d })} />
            ))}
          </ul>
        )}
      </section>

      <Pauta pauta={pauta} op={op} onVirarDecisao={(p) => setEdicao({ pauta: p })} />

      {edicao && <FormDecisao key={edicao.decisao?.id ?? `nova-${edicao.pauta?.id ?? ""}`} edicao={edicao} op={op} onFechar={fechar} />}
    </div>
  );
}

function LinhaDecisao({ d, op, onEditar }: { d: Decisao; op: Opcoes; onEditar: () => void }) {
  const [pendente, iniciar] = useTransition();
  const quem = op.pessoas.find((p) => p.id === d.quem_id)?.nome;
  const frente = op.frentes.find((f) => f.id === d.frente_id)?.nome;
  const ini = op.iniciativas.find((x) => x.id === d.iniciativa_id)?.titulo;
  return (
    <li className="grid grid-cols-[52px_1fr] gap-x-3 py-3.5">
      <span className="pt-0.5 text-[12px] tabular-nums text-ink-faint">{dataCurta(d.data, op.hoje)}</span>
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onEditar} className="min-w-0 flex-1 text-left text-[14px] font-medium leading-snug text-white hover:underline hover:underline-offset-4">
            {d.decisao}
          </button>
          <span className="shrink-0">
            <Etiqueta cor={corStatus(d.status)}>{STATUS_DECISAO.find((s) => s.id === d.status)!.nome}</Etiqueta>
          </span>
        </div>
        {d.porque && <p className="m-0 mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-dim">{d.porque}</p>}
        <p className="m-0 mt-1.5 flex flex-wrap gap-x-3 text-[11.5px] text-ink-faint">
          {quem && <span>{d.status === "pendente" ? `${quem} decide` : `por ${quem}`}</span>}
          {frente && <span>{frente}</span>}
          {ini && <span>↳ {ini}</span>}
        </p>
        {/* trocar o status rápido sem abrir o painel */}
        <span className="mt-1.5 flex gap-1">
          {STATUS_DECISAO.filter((s) => s.id !== d.status).map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={pendente}
              onClick={() => iniciar(async () => void (await mudarStatusDecisao(d.id, s.id)))}
              className="rounded-full px-2 py-0.5 text-[11px] text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-white"
            >
              → {s.nome}
            </button>
          ))}
        </span>
      </div>
    </li>
  );
}

function FormDecisao({ edicao, op, onFechar }: { edicao: NonNullable<Edicao>; op: Opcoes; onFechar: () => void }) {
  const d = edicao.decisao;
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarDecisao, {});
  const [apagando, iniciar] = useTransition();
  useEffect(() => {
    if (estado.ok) onFechar();
  }, [estado, onFechar]);
  return (
    <PainelLateral
      onFechar={onFechar}
      titulo={
        <>
          <p className="m-0 text-[11.5px] text-ink-faint">{d ? "Decisão" : edicao.pauta ? "Item da pauta → decisão" : "Nova decisão"}</p>
          <h2 className="mt-0.5 text-[18px] font-semibold text-white">{d ? "Editar" : "Registrar"}</h2>
        </>
      }
      acoes={
        d && (
          <BotaoIcone
            rotulo="Apagar decisão"
            disabled={apagando}
            onClick={() => {
              if (confirm("Apagar esta decisão? Não tem como desfazer.")) iniciar(async () => void ((await apagarDecisao(d.id)).ok && onFechar()));
            }}
          >
            <Trash2 size={15} />
          </BotaoIcone>
        )
      }
    >
      <form action={acao} className="flex flex-col gap-3">
        {d && <input type="hidden" name="id" value={d.id} />}
        {edicao.pauta && <input type="hidden" name="pauta_id" value={edicao.pauta.id} />}
        <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
          Decisão
          <textarea name="decisao" rows={2} maxLength={500} required defaultValue={d?.decisao ?? edicao.pauta?.assunto ?? ""} className={classeTexto} autoFocus />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
          Por quê
          <textarea name="porque" rows={4} maxLength={4000} defaultValue={d?.porque ?? edicao.pauta?.detalhe ?? ""} className={classeTexto} placeholder="O motivo, o que pesou, o que foi descartado" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Data
            <Input type="date" name="data" defaultValue={d?.data ?? op.hoje} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Quem decide
            <Select nome="quem_id" valor={d?.quem_id ?? null} opcoes={op.pessoas.map((p) => ({ id: p.id, nome: p.nome }))} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Status
            <select name="status" defaultValue={d?.status ?? "pendente"} className={classeSelect}>
              {STATUS_DECISAO.map((s) => (
                <option key={s.id} value={s.id} className={classeOpcao}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Frente
            <Select nome="frente_id" valor={d?.frente_id ?? null} opcoes={op.frentes.map((f) => ({ id: f.id, nome: f.nome }))} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
            Iniciativa
            <Select nome="iniciativa_id" valor={d?.iniciativa_id ?? null} opcoes={op.iniciativas.map((i) => ({ id: i.id, nome: i.titulo }))} />
          </label>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar"}
          </Button>
          <Aviso estado={estado.erro ? estado : {}} />
        </div>
      </form>
    </PainelLateral>
  );
}

function Select({ nome, valor, opcoes }: { nome: string; valor: number | null; opcoes: { id: number; nome: string }[] }) {
  return (
    <select name={nome} defaultValue={valor ?? ""} className={classeSelect}>
      <option value="" className={classeOpcao}>
        —
      </option>
      {opcoes.map((o) => (
        <option key={o.id} value={o.id} className={classeOpcao}>
          {o.nome}
        </option>
      ))}
    </select>
  );
}

// ---------- pauta ----------
function Pauta({ pauta, op, onVirarDecisao }: { pauta: ItemPauta[]; op: Opcoes; onVirarDecisao: (p: ItemPauta) => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(adicionarPauta, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const abertos = pauta.filter((p) => !p.resolvido_em);
  const resolvidos = pauta.filter((p) => p.resolvido_em).reverse();
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-semibold text-white">Pauta da reunião</h2>
        <p className="m-0 mt-0.5 text-[12.5px] text-ink-dim">Jogue os assuntos aqui durante a semana. Na reunião, cada um vira decisão ou tarefa.</p>
      </div>
      <form ref={form} action={acao} className="glass-lite glass-static flex flex-col gap-2 p-3">
        <Input name="assunto" placeholder="Assunto para a reunião" maxLength={200} required />
        <textarea name="detalhe" rows={2} maxLength={2000} placeholder="Contexto (opcional)" className={classeTexto} />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={pendente}>
            Pôr na pauta
          </Button>
          <Aviso estado={estado.erro ? estado : {}} />
        </div>
      </form>

      {abertos.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-faint">Pauta vazia.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {abertos.map((p, i) => (
            <ItemDaPauta key={p.id} p={p} n={i + 1} op={op} onVirarDecisao={() => onVirarDecisao(p)} />
          ))}
        </ol>
      )}

      {resolvidos.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[12.5px] text-ink-faint hover:text-white">Resolvidos nos últimos 14 dias · {resolvidos.length}</summary>
          <ul className="mt-2 flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {resolvidos.map((p) => (
              <Resolvido key={p.id} p={p} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ItemDaPauta({ p, n, op, onVirarDecisao }: { p: ItemPauta; n: number; op: Opcoes; onVirarDecisao: () => void }) {
  const [tarefa, setTarefa] = useState(false);
  const [pendente, iniciar] = useTransition();
  return (
    <li className="glass-lite glass-static flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2.5">
        <span className="pt-0.5 font-mono text-[11.5px] tabular-nums text-ink-faint">{String(n).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[13.5px] font-medium leading-snug text-white">{p.assunto}</p>
          {p.detalhe && <p className="m-0 mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-dim">{p.detalhe}</p>}
          <p className="m-0 mt-1 text-[11.5px] text-ink-faint">{p.autor}</p>
        </div>
      </div>
      {tarefa ? (
        <FormTarefa p={p} op={op} onPronto={() => setTarefa(false)} />
      ) : (
        <div className="flex flex-wrap gap-1.5 pl-6">
          <AcaoPauta onClick={onVirarDecisao}>Virou decisão</AcaoPauta>
          <AcaoPauta onClick={() => setTarefa(true)}>Virou tarefa</AcaoPauta>
          <AcaoPauta onClick={() => iniciar(async () => void (await descartarPauta(p.id)))} disabled={pendente} discreta>
            Descartar
          </AcaoPauta>
          <AcaoPauta
            onClick={() => {
              if (confirm(`Apagar "${p.assunto}" da pauta?`)) iniciar(async () => void (await apagarPauta(p.id)));
            }}
            disabled={pendente}
            discreta
          >
            Apagar
          </AcaoPauta>
        </div>
      )}
    </li>
  );
}

function AcaoPauta({ children, discreta = false, ...props }: { children: React.ReactNode; discreta?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-40",
        discreta ? "text-ink-faint hover:text-white" : "border border-line text-ink hover:border-accent/60 hover:text-white",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function FormTarefa({ p, op, onPronto }: { p: ItemPauta; op: Opcoes; onPronto: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(pautaParaTarefa, {});
  useEffect(() => {
    if (estado.ok) onPronto();
  }, [estado, onPronto]);
  return (
    <form action={acao} className="flex flex-col gap-2 pl-6">
      <input type="hidden" name="pauta_id" value={p.id} />
      <Input name="texto" defaultValue={p.assunto} maxLength={300} required aria-label="Tarefa" />
      <div className="grid grid-cols-3 gap-2">
        <select name="iniciativa_id" required defaultValue="" aria-label="Projeto" className={cn(classeSelect, "col-span-3")}>
          <option value="" disabled className={classeOpcao}>
            Em qual projeto?
          </option>
          {op.iniciativas.map((i) => (
            <option key={i.id} value={i.id} className={classeOpcao}>
              {i.titulo}
            </option>
          ))}
        </select>
        <select name="responsavel_id" defaultValue="" aria-label="Responsável" className={cn(classeSelect, "col-span-2")}>
          <option value="" className={classeOpcao}>
            Responsável…
          </option>
          {op.pessoas.map((x) => (
            <option key={x.id} value={x.id} className={classeOpcao}>
              {x.nome}
            </option>
          ))}
        </select>
        <Input type="date" name="prazo" aria-label="Prazo" />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          Criar tarefa
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onPronto}>
          Cancelar
        </Button>
        <Aviso estado={estado.erro ? estado : {}} />
      </div>
    </form>
  );
}

function Resolvido({ p }: { p: ItemPauta }) {
  const [pendente, iniciar] = useTransition();
  const virou = p.virou === "decisao" ? "virou decisão" : p.virou === "tarefa" ? "virou tarefa" : "descartado";
  return (
    <li className="flex items-center gap-2 py-2 text-[12.5px]">
      <span className="min-w-0 flex-1 truncate text-ink-dim">{p.assunto}</span>
      <span className="shrink-0 text-ink-faint">{virou}</span>
      <BotaoIcone rotulo="Voltar para a pauta" disabled={pendente} onClick={() => iniciar(async () => void (await reabrirPauta(p.id)))}>
        <RotateCcw size={13} />
      </BotaoIcone>
    </li>
  );
}
