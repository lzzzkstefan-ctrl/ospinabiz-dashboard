"use client";

// Quadro de melhorias: 4 colunas por status; arrasta o cartão pela alça (⋮⋮) para outra coluna. No
// celular também dá para trocar no seletor de status do cartão. Indo para "Feito", pede a linha que
// aparece em Novidades (já vem com o título).

import { Aviso, Campo, Gaveta, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ABAS, PRIORIDADES, STATUS, nomePrioridade, type Melhoria, type Status } from "@/modulos/melhorias/regras";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, rectIntersection, type CollisionDetection, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useActionState, useId, useState, useTransition } from "react";
import { apagarMelhoria, criarMelhoria, editarMelhoria, moverMelhoria } from "../acoes";

// solta na coluna que está embaixo do ponteiro/dedo (o cartão é largo: pela área ele "caía" na vizinha);
// pelo teclado não há ponteiro, então vale a área
const colunaDoPonteiro: CollisionDetection = (args) => {
  const sob = pointerWithin(args);
  return sob.length ? sob : rectIntersection(args);
};

const COR_PRIORIDADE: Record<Melhoria["prioridade"], string> = {
  alta: "text-[rgb(var(--tag-vermelho))] border-[rgb(var(--tag-vermelho)/0.45)]",
  media: "text-[rgb(var(--tag-laranja))] border-[rgb(var(--tag-laranja)/0.45)]",
  baixa: "text-ink-dim border-line",
};

export function Quadro({ itens }: { itens: Melhoria[] }) {
  // movimento otimista: o cartão já muda de coluna enquanto o servidor grava
  const [movidos, setMovidos] = useState<Map<number, Status>>(new Map());
  const [paraFeito, setParaFeito] = useState<Melhoria | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  // id fixo: sem ele a biblioteca gera ids diferentes no servidor e no navegador (aviso de hidratação)
  const idDnd = useId();
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const statusDe = (m: Melhoria) => movidos.get(m.id) ?? m.status;

  function mover(m: Melhoria, status: Status, novidade?: string) {
    if (statusDe(m) === status) return;
    if (status === "feito" && novidade === undefined) {
      setParaFeito(m);
      return;
    }
    setErro(null);
    setMovidos((antes) => new Map(antes).set(m.id, status));
    iniciar(async () => {
      const r = await moverMelhoria(m.id, status, novidade);
      if (r.erro) {
        setErro(r.erro);
        setMovidos((antes) => {
          const novo = new Map(antes);
          novo.delete(m.id);
          return novo;
        });
      }
    });
  }

  function soltar(e: DragEndEvent) {
    const m = itens.find((x) => x.id === e.active.id);
    const destino = e.over?.id;
    if (m && typeof destino === "string" && STATUS.some((s) => s.id === destino)) mover(m, destino as Status);
  }

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <p role="alert" className="text-[13px] text-accent-3">
          {erro}
        </p>
      )}
      {paraFeito && (
        <ConfirmarFeito
          m={paraFeito}
          onConfirmar={(linha) => {
            const m = paraFeito;
            setParaFeito(null);
            mover(m, "feito", linha);
          }}
          onCancelar={() => setParaFeito(null)}
        />
      )}
      <DndContext id={idDnd} sensors={sensores} collisionDetection={colunaDoPonteiro} onDragEnd={soltar}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATUS.map((s) => {
            const daColuna = itens.filter((m) => statusDe(m) === s.id);
            return (
              <Coluna key={s.id} id={s.id} nome={s.nome} qtd={daColuna.length}>
                {daColuna.map((m) => (
                  <Cartao key={m.id} m={m} status={statusDe(m)} onMover={(st) => mover(m, st)} />
                ))}
              </Coluna>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}

function Coluna({ id, nome, qtd, children }: { id: Status; nome: string; qtd: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={nome}
      className={cn("glass-lite glass-static flex min-h-[160px] flex-col gap-2 p-3 transition-colors", isOver && "border-accent/60 bg-accent/5")}
    >
      <h2 className="mb-1 flex items-baseline justify-between text-[14px] font-semibold text-white">
        {nome}
        <span className="text-[12px] font-normal tabular-nums text-ink-faint">{qtd}</span>
      </h2>
      {qtd === 0 && <p className="m-0 py-4 text-center text-[12.5px] italic text-ink-faint">Arraste um cartão para cá.</p>}
      {children}
    </section>
  );
}

function Cartao({ m, status, onMover }: { m: Melhoria; status: Status; onMover: (s: Status) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: m.id });
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article
      ref={setNodeRef}
      style={estilo}
      className={cn("relative flex flex-wrap items-start gap-2 rounded-xl border border-line-soft bg-bg-raised p-3", isDragging && "z-50 opacity-90 shadow-2xl")}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label={`Arrastar "${m.titulo}"`}
        className="-ml-1 mt-0.5 cursor-grab touch-none rounded p-0.5 text-ink-faint hover:text-white active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-[13.5px] font-semibold leading-snug text-white">{m.titulo}</h3>
        {m.descricao && <p className="m-0 mt-1 line-clamp-3 whitespace-pre-line text-[12.5px] text-ink-dim">{m.descricao}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={cn("rounded-full border px-2 py-0.5", COR_PRIORIDADE[m.prioridade])}>{nomePrioridade(m.prioridade)}</span>
          {m.aba && <span className="rounded-full border border-line px-2 py-0.5 text-ink-dim">{m.aba}</span>}
          {m.sugeridoNome && <span className="text-ink-faint">por {m.sugeridoNome}</span>}
        </div>
      </div>
      <div className="flex w-full items-center gap-2">
        <label className="sr-only" htmlFor={`status-${m.id}`}>
          Status
        </label>
        <select
          id={`status-${m.id}`}
          value={status}
          onChange={(e) => onMover(e.target.value as Status)}
          className={cn(classeSelect, "h-7 w-auto py-0 text-[12px]")}
        >
          {STATUS.map((s) => (
            <option key={s.id} value={s.id} className={classeOpcao}>
              {s.nome}
            </option>
          ))}
        </select>
        <Gaveta rotulo="Editar">
          <FormEditar m={m} />
        </Gaveta>
      </div>
    </article>
  );
}

function ConfirmarFeito({ m, onConfirmar, onCancelar }: { m: Melhoria; onConfirmar: (linha: string) => void; onCancelar: () => void }) {
  const [linha, setLinha] = useState(m.novidade ?? m.titulo);
  return (
    <div role="dialog" aria-label="Linha da novidade" className="glass-lite glass-static flex flex-wrap items-end gap-3 border-accent/50 p-4">
      <Campo rotulo={`“${m.titulo}” vai para Feito. Linha que aparece em Novidades:`} className="min-w-[260px] flex-1">
        <Input value={linha} onChange={(e) => setLinha(e.target.value)} maxLength={300} autoFocus />
      </Campo>
      <Button type="button" onClick={() => onConfirmar(linha)}>
        Confirmar
      </Button>
      <button type="button" onClick={onCancelar} className="text-[12.5px] text-ink-dim underline-offset-4 hover:underline">
        Cancelar
      </button>
    </div>
  );
}

function CamposBasicos({ m }: { m?: Melhoria }) {
  return (
    <>
      <Campo rotulo="Título">
        <Input name="titulo" defaultValue={m?.titulo} maxLength={120} required />
      </Campo>
      <Campo rotulo="Descrição">
        <textarea name="descricao" defaultValue={m?.descricao ?? ""} maxLength={2000} rows={3} className={cn(classeSelect, "h-auto py-2")} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Prioridade">
          <select name="prioridade" defaultValue={m?.prioridade ?? "media"} className={classeSelect}>
            {PRIORIDADES.map((p) => (
              <option key={p.id} value={p.id} className={classeOpcao}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Aba">
          <select name="aba" defaultValue={m?.aba ?? ""} className={classeSelect}>
            <option value="" className={classeOpcao}>
              —
            </option>
            {ABAS.map((a) => (
              <option key={a} value={a} className={classeOpcao}>
                {a}
              </option>
            ))}
          </select>
        </Campo>
      </div>
    </>
  );
}

function FormEditar({ m }: { m: Melhoria }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(editarMelhoria, {});
  return (
    <div className="flex flex-col gap-3">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={m.id} />
        <CamposBasicos m={m} />
        {m.status === "feito" && (
          <Campo rotulo="Linha em Novidades">
            <Input name="novidade" defaultValue={m.novidade ?? ""} maxLength={300} />
          </Campo>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar"}
          </Button>
          <Aviso estado={estado} />
        </div>
      </form>
      <form
        action={apagarMelhoria}
        onSubmit={(e) => {
          if (!confirm(`Apagar "${m.titulo}"?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={m.id} />
        <button type="submit" className="text-[12px] text-ink-dim underline-offset-4 hover:underline">
          apagar
        </button>
      </form>
    </div>
  );
}

export function FormNovaMelhoria() {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarMelhoria, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <CamposBasicos />
      <Campo rotulo="Coluna">
        <select name="status" defaultValue="fazer" className={classeSelect}>
          {STATUS.map((s) => (
            <option key={s.id} value={s.id} className={classeOpcao}>
              {s.nome}
            </option>
          ))}
        </select>
      </Campo>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Criar"}
        </Button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
