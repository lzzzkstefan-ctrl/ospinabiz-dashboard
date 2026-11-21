"use client";

// Prioridades da semana no Hoje: 3 espaços fixos. Cada uma tem dono e prazo; dá para editar,
// concluir e apagar ali mesmo. Espaço vazio vira o formulário de nova prioridade.

import { Aviso, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Pessoa, Prioridade } from "@/modulos/gestao/dados";
import { MAX_PRIORIDADES, textoPrazo, diasAte } from "@/modulos/gestao/regras";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { apagarPrioridade, concluirPrioridade, salvarPrioridade } from "../../acoes-hoje";

export function Prioridades({ itens, pessoas, semana, hoje }: { itens: Prioridade[]; pessoas: Pessoa[]; semana: string; hoje: string }) {
  const [novaAberta, setNovaAberta] = useState(false);
  const vagas = Math.max(0, MAX_PRIORIDADES - itens.length);
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {itens.map((p, i) => (
        <li key={p.id} className="min-w-0">
          <CartaoPrioridade p={p} n={i + 1} pessoas={pessoas} semana={semana} hoje={hoje} />
        </li>
      ))}
      {Array.from({ length: vagas }, (_, i) => (
        <li key={`vaga-${i}`} className="min-w-0">
          {i === 0 && novaAberta ? (
            <div className="glass-lite glass-static h-full p-4">
              <FormPrioridade pessoas={pessoas} semana={semana} onPronto={() => setNovaAberta(false)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNovaAberta(true)}
              disabled={i !== 0}
              className={cn(
                "flex h-full min-h-[132px] w-full flex-col items-start justify-between rounded-[18px] border border-dashed border-line p-4 text-left transition-colors",
                i === 0 ? "hover:border-accent/60 hover:bg-accent/5" : "opacity-50",
              )}
            >
              <span className="font-mono text-[12px] tabular-nums text-ink-faint">{String(itens.length + i + 1).padStart(2, "0")}</span>
              <span className="flex items-center gap-1.5 text-[13px] text-ink-dim">
                <Plus size={14} aria-hidden /> {i === 0 ? "Definir prioridade" : "Espaço livre"}
              </span>
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function CartaoPrioridade({ p, n, pessoas, semana, hoje }: { p: Prioridade; n: number; pessoas: Pessoa[]; semana: string; hoje: string }) {
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const feita = !!p.concluida_em;
  const dono = pessoas.find((x) => x.id === p.dono_id)?.nome;
  const atrasada = !feita && p.prazo != null && diasAte(p.prazo, hoje) < 0;

  if (editando)
    return (
      <div className="glass-lite glass-static h-full p-4">
        <FormPrioridade p={p} pessoas={pessoas} semana={semana} onPronto={() => setEditando(false)} />
      </div>
    );

  const agir = (f: () => Promise<EstadoForm>) =>
    iniciar(async () => {
      setErro(null);
      const r = await f();
      if (r.erro) setErro(r.erro);
    });

  return (
    <article className={cn("glass-lite glass-static flex h-full min-h-[132px] flex-col gap-2 p-4", feita && "opacity-60", atrasada && "border-[rgb(var(--tag-vermelho)/0.5)]")}>
      <div className="flex items-start gap-3">
        <span className="font-mono text-[12px] tabular-nums text-ink-faint">{String(n).padStart(2, "0")}</span>
        <h3 className={cn("min-w-0 flex-1 text-[15px] font-semibold leading-snug text-white", feita && "line-through decoration-ink-faint")}>{p.titulo}</h3>
      </div>
      {p.descricao && <p className="m-0 line-clamp-3 pl-7 text-[12.5px] leading-relaxed text-ink-dim">{p.descricao}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[12px]">
        <span className="text-ink-dim">{dono ?? "sem dono"}</span>
        {p.prazo && <span className={atrasada ? "text-[rgb(var(--tag-vermelho))]" : "text-ink-faint"}>{textoPrazo(p.prazo, hoje)}</span>}
        <span className="ml-auto flex items-center gap-0.5">
          <BotaoIcone rotulo={feita ? "Reabrir" : "Concluir"} onClick={() => agir(() => concluirPrioridade(p.id, !feita))} disabled={pendente}>
            <Check size={15} />
          </BotaoIcone>
          <BotaoIcone rotulo="Editar" onClick={() => setEditando(true)} disabled={pendente}>
            <Pencil size={14} />
          </BotaoIcone>
          <BotaoIcone
            rotulo="Apagar"
            onClick={() => {
              if (confirm(`Apagar "${p.titulo}"?`)) agir(() => apagarPrioridade(p.id));
            }}
            disabled={pendente}
          >
            <Trash2 size={14} />
          </BotaoIcone>
        </span>
      </div>
      {erro && <p className="m-0 pl-7 text-[12px] text-[rgb(var(--tag-vermelho))]">{erro}</p>}
    </article>
  );
}

export function BotaoIcone({ rotulo, children, ...props }: { rotulo: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={rotulo} title={rotulo} className="grid size-8 place-items-center rounded-full text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-white disabled:opacity-40" {...props}>
      {children}
    </button>
  );
}

function FormPrioridade({ p, pessoas, semana, onPronto }: { p?: Prioridade; pessoas: Pessoa[]; semana: string; onPronto: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarPrioridade, {});
  useEffect(() => {
    if (estado.ok) onPronto();
  }, [estado, onPronto]);
  return (
    <form action={acao} className="flex flex-col gap-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <input type="hidden" name="semana" value={semana} />
      <Input name="titulo" defaultValue={p?.titulo} placeholder="O que precisa acontecer esta semana" maxLength={160} required autoFocus />
      <textarea
        name="descricao"
        defaultValue={p?.descricao ?? ""}
        placeholder="Detalhe (opcional)"
        maxLength={2000}
        rows={2}
        className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="grid grid-cols-2 gap-2">
        <select name="dono_id" defaultValue={p?.dono_id ?? ""} aria-label="Dono" className={classeSelect}>
          <option value="" className={classeOpcao}>
            Dono…
          </option>
          {pessoas.map((x) => (
            <option key={x.id} value={x.id} className={classeOpcao}>
              {x.nome}
            </option>
          ))}
        </select>
        <Input type="date" name="prazo" defaultValue={p?.prazo ?? ""} aria-label="Prazo" />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onPronto}>
          Cancelar
        </Button>
        <Aviso estado={estado.erro ? estado : {}} />
      </div>
    </form>
  );
}
