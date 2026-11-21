"use client";

// Painel de uma iniciativa: dados principais, checklist com responsável e prazo por item, links e
// comentários. Cada parte grava sozinha.

import { Aviso, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { PainelLateral } from "@/components/painel-lateral";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Frente, Iniciativa, Item, Pessoa } from "@/modulos/gestao/dados";
import { COLUNAS, diasAte } from "@/modulos/gestao/regras";
import { ExternalLink, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { BotaoIcone } from "../../_componentes/hoje/prioridades";
import { ajustarItem, alternarItem, apagarComentario, apagarIniciativa, apagarItem, apagarLink, comentar, criarItem, criarLink, salvarIniciativa } from "../acoes";

const classeTexto =
  "w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function DetalheIniciativa({ i, frentes, pessoas, hoje, onFechar }: { i: Iniciativa; frentes: Frente[]; pessoas: Pessoa[]; hoje: string; onFechar: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const coluna = COLUNAS.find((c) => c.id === i.coluna)!;

  return (
    <PainelLateral
      onFechar={onFechar}
      titulo={
        <>
          <p className="m-0 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
            <span className="size-2 rounded-full" style={{ background: `rgb(var(--tag-${coluna.cor}))` }} /> {coluna.nome}
          </p>
          <h2 className="mt-0.5 text-[18px] font-semibold leading-snug text-white">{i.titulo}</h2>
        </>
      }
      acoes={
        <BotaoIcone
          rotulo="Apagar iniciativa"
          disabled={pendente}
          onClick={() => {
            if (!confirm(`Apagar "${i.titulo}" com checklist, links e comentários? Não tem como desfazer.`)) return;
            iniciar(async () => {
              const r = await apagarIniciativa(i.id);
              if (r.erro) setErro(r.erro);
              else onFechar();
            });
          }}
        >
          <Trash2 size={15} />
        </BotaoIcone>
      }
    >
      {erro && <p className="mb-3 text-[12.5px] text-[rgb(var(--tag-vermelho))]">{erro}</p>}
      <div className="flex flex-col gap-8">
        <Dados i={i} frentes={frentes} pessoas={pessoas} />
        <Checklist i={i} pessoas={pessoas} hoje={hoje} />
        <Links i={i} />
        <Comentarios i={i} />
      </div>
    </PainelLateral>
  );
}

function Titulo({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <h3 className="mb-2.5 flex items-baseline gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
      {children}
      {extra && <span className="font-normal normal-case tracking-normal">{extra}</span>}
    </h3>
  );
}

function Dados({ i, frentes, pessoas }: { i: Iniciativa; frentes: Frente[]; pessoas: Pessoa[] }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarIniciativa, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={i.id} />
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Título
        <Input name="titulo" defaultValue={i.titulo} maxLength={160} required />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Objetivo em uma frase
        <Input name="objetivo" defaultValue={i.objetivo ?? ""} maxLength={300} placeholder="O que muda quando isso estiver no ar" />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
          Frente
          <select name="frente_id" defaultValue={i.frente_id ?? ""} className={classeSelect}>
            <option value="" className={classeOpcao}>
              —
            </option>
            {frentes.map((f) => (
              <option key={f.id} value={f.id} className={classeOpcao}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
          Dono
          <SelectPessoa nome="dono_id" valor={i.dono_id} pessoas={pessoas} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
          Prazo
          <Input type="date" name="prazo" defaultValue={i.prazo ?? ""} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

function SelectPessoa({ nome, valor, pessoas, onChange, rotulo }: { nome?: string; valor: number | null; pessoas: Pessoa[]; onChange?: (v: number | null) => void; rotulo?: string }) {
  return (
    <select
      name={nome}
      aria-label={rotulo}
      defaultValue={valor ?? ""}
      onChange={onChange ? (e) => onChange(e.target.value ? Number(e.target.value) : null) : undefined}
      className={classeSelect}
    >
      <option value="" className={classeOpcao}>
        —
      </option>
      {pessoas.map((p) => (
        <option key={p.id} value={p.id} className={classeOpcao}>
          {p.nome}
        </option>
      ))}
    </select>
  );
}

// ---------- checklist ----------
function Checklist({ i, pessoas, hoje }: { i: Iniciativa; pessoas: Pessoa[]; hoje: string }) {
  const feitos = i.itens.filter((x) => x.feito_em).length;
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarItem, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  return (
    <section>
      <Titulo extra={i.itens.length ? <span className="tabular-nums">{feitos}/{i.itens.length}</span> : undefined}>Checklist</Titulo>
      {i.itens.length > 0 && (
        <ul className="mb-3 flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {i.itens.map((x) => (
            <LinhaItem key={x.id} x={x} pessoas={pessoas} hoje={hoje} />
          ))}
        </ul>
      )}
      <form ref={form} action={acao} className="grid grid-cols-[1fr_120px_140px_auto] gap-2 max-sm:grid-cols-2">
        <input type="hidden" name="iniciativa_id" value={i.id} />
        <Input name="texto" placeholder="Novo item" maxLength={300} required className="max-sm:col-span-2" />
        <SelectPessoa nome="responsavel_id" valor={null} pessoas={pessoas} rotulo="Responsável" />
        <Input type="date" name="prazo" aria-label="Prazo" />
        <Button type="submit" size="sm" variant="outline" disabled={pendente} className="h-9">
          Adicionar
        </Button>
      </form>
      <Aviso estado={estado.erro ? estado : {}} />
    </section>
  );
}

function LinhaItem({ x, pessoas, hoje }: { x: Item; pessoas: Pessoa[]; hoje: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const agir = (f: () => Promise<EstadoForm>) =>
    iniciar(async () => {
      setErro(null);
      const r = await f();
      if (r.erro) setErro(r.erro);
    });
  const feito = !!x.feito_em;
  const atrasado = !feito && x.prazo != null && diasAte(x.prazo, hoje) < 0;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={feito}
          disabled={pendente}
          onChange={(e) => agir(() => alternarItem(x.id, e.target.checked))}
          aria-label={feito ? "Desmarcar" : "Marcar como feito"}
          className="size-4 shrink-0 accent-[var(--accent)]"
        />
        <span className={cn("min-w-0 flex-1 text-[13.5px]", feito ? "text-ink-faint line-through" : "text-ink")}>{x.texto}</span>
        <select
          aria-label="Responsável"
          defaultValue={x.responsavel_id ?? ""}
          onChange={(e) => agir(() => ajustarItem(x.id, { responsavel_id: e.target.value ? Number(e.target.value) : null }))}
          className="h-7 w-[92px] shrink-0 rounded-md border border-transparent bg-transparent px-1 text-[12px] text-ink-dim hover:border-line focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="" className={classeOpcao}>
            ninguém
          </option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id} className={classeOpcao}>
              {p.nome}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Prazo"
          defaultValue={x.prazo ?? ""}
          onChange={(e) => agir(() => ajustarItem(x.id, { prazo: e.target.value || null }))}
          className={cn(
            "h-7 w-[118px] shrink-0 rounded-md border border-transparent bg-transparent px-1 text-[12px] hover:border-line focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            atrasado ? "text-[rgb(var(--tag-vermelho))]" : "text-ink-dim",
          )}
        />
        <BotaoIcone rotulo="Apagar item" disabled={pendente} onClick={() => agir(() => apagarItem(x.id))}>
          <Trash2 size={13} />
        </BotaoIcone>
      </div>
      {erro && <p className="m-0 pl-6 text-[12px] text-[rgb(var(--tag-vermelho))]">{erro}</p>}
    </li>
  );
}

// ---------- links ----------
function Links({ i }: { i: Iniciativa }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarLink, {});
  const [, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  return (
    <section>
      <Titulo>Links</Titulo>
      {i.links.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {i.links.map((l) => (
            <li key={l.id} className="group flex items-center gap-2">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] text-ink hover:bg-bg-raised-2 hover:text-white">
                <ExternalLink size={13} className="shrink-0 text-ink-faint" aria-hidden />
                <span className="truncate">{l.titulo}</span>
              </a>
              <BotaoIcone rotulo="Apagar link" onClick={() => iniciar(async () => void (await apagarLink(l.id)))}>
                <Trash2 size={13} />
              </BotaoIcone>
            </li>
          ))}
        </ul>
      )}
      <form ref={form} action={acao} className="grid grid-cols-[150px_1fr_auto] gap-2 max-sm:grid-cols-1">
        <input type="hidden" name="iniciativa_id" value={i.id} />
        <Input name="titulo" placeholder="Nome (opcional)" maxLength={120} />
        <Input name="url" type="url" placeholder="https://…" required />
        <Button type="submit" size="sm" variant="outline" disabled={pendente} className="h-9">
          Adicionar
        </Button>
      </form>
      <Aviso estado={estado.erro ? estado : {}} />
    </section>
  );
}

// ---------- comentários ----------
function Comentarios({ i }: { i: Iniciativa }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(comentar, {});
  const [, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  const quando = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <section>
      <Titulo>Comentários</Titulo>
      {i.comentarios.length > 0 && (
        <ul className="mb-3 flex flex-col gap-3">
          {i.comentarios.map((c) => (
            <li key={c.id} className="group">
              <p className="m-0 flex items-center gap-2 text-[12px] text-ink-faint">
                <span className="font-medium text-ink-dim">{c.autor}</span> {quando(c.criado_em)}
                {c.meu && (
                  <button type="button" onClick={() => iniciar(async () => void (await apagarComentario(c.id)))} className="ml-auto opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus-visible:opacity-100">
                    apagar
                  </button>
                )}
              </p>
              <p className="m-0 mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{c.texto}</p>
            </li>
          ))}
        </ul>
      )}
      <form ref={form} action={acao} className="flex flex-col gap-2">
        <input type="hidden" name="iniciativa_id" value={i.id} />
        <textarea name="texto" rows={2} maxLength={4000} required placeholder="Escreva um comentário" className={classeTexto} />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={pendente}>
            Comentar
          </Button>
          <Aviso estado={estado.erro ? estado : {}} />
        </div>
      </form>
    </section>
  );
}
