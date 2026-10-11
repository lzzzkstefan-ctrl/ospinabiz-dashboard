"use client";

// Kanban das tarefas: 4 colunas (A fazer, Fazendo, Travado, Feito). Arrasta o cartão para outra
// coluna ou para outra posição na mesma coluna (mouse, toque com leve atraso e teclado). Ao soltar,
// grava coluna + posição numa única atualização; com erro, a tela volta ao que está no banco.

import { Etiqueta } from "@/components/ui/etiqueta";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { OpcoesTarefa } from "@/modulos/tarefas/dados";
import {
  COLUNAS,
  corDaPessoa,
  estaAtrasada,
  formatarData,
  ordemEntre,
  resumir,
  textoVinculo,
  type Pessoa,
  type StatusTarefa,
  type Tarefa,
} from "@/modulos/tarefas/regras";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useId, useMemo, useState, useTransition } from "react";
import { moverTarefa, trocarResponsavel } from "../acoes";
import { BotaoConcluir } from "./botao-concluir";
import { ModalTarefa } from "./form-editar-tarefa";
import { FormNovaTarefa } from "./form-nova-tarefa";

type Ajuste = Partial<Pick<Tarefa, "status" | "ordem" | "responsavel">>;
type Filtro = "todos" | number;

const COR_PRIORIDADE: Record<Tarefa["prioridade"], string> = {
  alta: "text-[rgb(var(--tag-vermelho))] border-[rgb(var(--tag-vermelho)/0.45)]",
  media: "text-[rgb(var(--tag-laranja))] border-[rgb(var(--tag-laranja)/0.45)]",
  baixa: "text-ink-dim border-line",
};
const NOME_PRIORIDADE: Record<Tarefa["prioridade"], string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

// vale o que está embaixo do ponteiro/dedo (cartão ou coluna): pelos cantos, uma coluna vazia e alta
// perdia para os cartões da coluna vizinha; pelo teclado não há ponteiro, então valem os cantos
const embaixoDoPonteiro: CollisionDetection = (args) => {
  const sob = pointerWithin(args);
  return sob.length ? sob : closestCorners(args);
};

const ehColuna = (id: unknown): id is StatusTarefa => COLUNAS.some((c) => c.id === id);

export function Kanban({ itens, opcoes, agora, hoje }: { itens: Tarefa[]; opcoes: OpcoesTarefa; agora: string; hoje: string }) {
  // mudanças otimistas (cartão já aparece no lugar novo enquanto o servidor grava); somem quando
  // a lista nova do servidor chega
  const [base, setBase] = useState(itens);
  const [ajustes, setAjustes] = useState<Map<number, Ajuste>>(new Map());
  if (base !== itens) {
    setBase(itens);
    setAjustes(new Map());
  }
  // durante o arrastar: em que coluna o cartão está passando
  const [arrasto, setArrasto] = useState<{ id: number; status: StatusTarefa; ordem: number } | null>(null);
  const [ativaId, setAtivaId] = useState<number | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  // id fixo: sem ele a biblioteca gera ids diferentes no servidor e no navegador (aviso de hidratação)
  const idDnd = useId();

  const tarefas = useMemo(
    () =>
      itens.map((t) => {
        const a = ajustes.get(t.id);
        const comAjuste = a ? { ...t, ...a } : t;
        return arrasto?.id === t.id ? { ...comAjuste, status: arrasto.status, ordem: arrasto.ordem } : comAjuste;
      }),
    [itens, ajustes, arrasto],
  );
  const visiveis = useMemo(() => (filtro === "todos" ? tarefas : tarefas.filter((t) => t.responsavel?.id === filtro)), [tarefas, filtro]);
  const porColuna = useMemo(() => {
    const mapa = {} as Record<StatusTarefa, Tarefa[]>;
    for (const c of COLUNAS) mapa[c.id] = visiveis.filter((t) => t.status === c.id).sort((a, b) => a.ordem - b.ordem);
    return mapa;
  }, [visiveis]);
  const resumo = resumir(visiveis, agora);
  const pct = resumo.total ? Math.round((resumo.feitas / resumo.total) * 100) : 0;

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // no toque, segurar um instante antes de arrastar (senão confunde com rolar a tela)
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const colunaDe = (id: unknown): StatusTarefa | undefined => (ehColuna(id) ? id : tarefas.find((t) => t.id === id)?.status);

  function ajustar(id: number, a: Ajuste | null) {
    setAjustes((antes) => {
      const novo = new Map(antes);
      if (a) novo.set(id, { ...novo.get(id), ...a });
      else novo.delete(id);
      return novo;
    });
  }

  function aoComecar({ active }: DragStartEvent) {
    setErro(null);
    setAtivaId(Number(active.id));
  }

  // passando por outra coluna: o cartão já aparece nela (perto do cartão embaixo do ponteiro)
  function aoPassar({ active, over }: DragOverEvent) {
    if (!over) return;
    const destino = colunaDe(over.id);
    const atual = tarefas.find((t) => t.id === active.id);
    if (!destino || !atual || atual.status === destino) return;
    const alvo = tarefas.find((t) => t.id === over.id);
    setArrasto({ id: atual.id, status: destino, ordem: alvo ? alvo.ordem - 0.0001 : Number.MAX_SAFE_INTEGER });
  }

  function aoSoltar({ active, over }: DragEndEvent) {
    setAtivaId(null);
    const id = Number(active.id);
    const original = itens.find((t) => t.id === id);
    const destino = over ? colunaDe(over.id) : undefined;
    if (!original || !destino) {
      setArrasto(null);
      return;
    }
    const lista = porColuna[destino];
    const de = lista.findIndex((t) => t.id === id);
    const para = ehColuna(over!.id) ? lista.length - 1 : lista.findIndex((t) => t.id === over!.id);
    const nova = de === -1 ? lista : arrayMove(lista, de, para === -1 ? de : para);
    const i = nova.findIndex((t) => t.id === id);
    const antes = (ajustes.get(id)?.status ?? original.status) === destino && de === i;
    setArrasto(null);
    if (i === -1 || antes) return; // soltou onde já estava

    const ordem = ordemEntre(nova[i - 1]?.ordem, nova[i + 1]?.ordem);
    ajustar(id, { status: destino, ordem });
    iniciar(async () => {
      const r = await moverTarefa(id, destino, ordem);
      if (r.erro) {
        setErro(r.erro);
        ajustar(id, null);
      }
    });
  }

  function trocar(t: Tarefa, pessoa: Pessoa | null) {
    if ((t.responsavel?.id ?? null) === (pessoa?.id ?? null)) return;
    setErro(null);
    ajustar(t.id, { responsavel: pessoa });
    iniciar(async () => {
      const r = await trocarResponsavel(t.id, pessoa?.id ?? null);
      if (r.erro) {
        setErro(r.erro);
        ajustar(t.id, null);
      }
    });
  }

  const fecharModal = useCallback(() => setEditandoId(null), []);
  const ativa = ativaId === null ? null : tarefas.find((t) => t.id === ativaId);
  const editando = editandoId === null ? null : itens.find((t) => t.id === editandoId);

  return (
    <div className="flex flex-col gap-5">
      {/* Resumo */}
      <section aria-label="Resumo" className="glass-lite glass-static flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="m-0 text-[24px] font-semibold tabular-nums text-white">
            {resumo.feitas}/{resumo.total} <span className="text-[14px] font-normal text-ink-dim">feitas</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Etiqueta cor="azul">{resumo.fazendo} fazendo</Etiqueta>
            <Etiqueta cor="laranja">{resumo.travadas} travadas</Etiqueta>
            <Etiqueta cor={resumo.atrasadas ? "vermelho" : "cinza"}>{resumo.atrasadas} atrasadas</Etiqueta>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bg-raised-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso">
          <div className="h-full rounded-full bg-[rgb(var(--tag-verde))] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {/* Filtro por pessoa */}
      <nav className="flex flex-wrap gap-1.5" aria-label="Filtro por responsável">
        {[{ id: "todos" as const, nome: "Todos" }, ...opcoes.equipe].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFiltro(p.id)}
            aria-pressed={filtro === p.id}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors",
              filtro === p.id ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
            )}
          >
            {p.id !== "todos" && <span className="size-2 rounded-full" style={{ background: `rgb(var(--tag-${corDaPessoa(p.nome)}))` }} />}
            {p.nome}
          </button>
        ))}
      </nav>

      {erro && (
        <p role="alert" className="m-0 text-[13px] text-accent-3">
          {erro} A tela voltou ao que está salvo.
        </p>
      )}

      <DndContext
        id={idDnd}
        sensors={sensores}
        collisionDetection={embaixoDoPonteiro}
        onDragStart={aoComecar}
        onDragOver={aoPassar}
        onDragEnd={aoSoltar}
        onDragCancel={() => {
          setAtivaId(null);
          setArrasto(null);
        }}
      >
        {/* celular: colunas rolam na horizontal; desktop: as 4 lado a lado */}
        <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
          {COLUNAS.map((c) => (
            <Coluna key={c.id} id={c.id} nome={c.nome} cor={c.cor} qtd={porColuna[c.id].length}>
              {c.id === "a_fazer" && <FormNovaTarefa equipe={opcoes.equipe} responsavelPadrao={filtro === "todos" ? null : filtro} />}
              <SortableContext items={porColuna[c.id].map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {porColuna[c.id].map((t) => (
                  <CartaoArrastavel key={t.id} t={t} equipe={opcoes.equipe} agora={agora} hoje={hoje} onAbrir={() => setEditandoId(t.id)} onTrocar={(p) => trocar(t, p)} />
                ))}
              </SortableContext>
            </Coluna>
          ))}
        </div>
        <DragOverlay>{ativa ? <Cartao t={ativa} agora={agora} hoje={hoje} flutuando /> : null}</DragOverlay>
      </DndContext>

      {editando && <ModalTarefa key={editando.id} tarefa={editando} opcoes={opcoes} onFechar={fecharModal} />}
    </div>
  );
}

function Coluna({ id, nome, cor, qtd, children }: { id: StatusTarefa; nome: string; cor: string; qtd: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={nome}
      className={cn(
        "glass-lite glass-static flex min-h-[220px] w-[82vw] max-w-[320px] shrink-0 snap-start flex-col gap-2 p-3 transition-colors lg:w-auto lg:max-w-none",
        isOver && "border-accent/60 bg-accent/5",
      )}
    >
      <h2 className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-white">
        <span className="size-2.5 rounded-full" style={{ background: `rgb(var(--tag-${cor}))` }} />
        {nome}
        <span className="ml-auto rounded-full bg-bg-raised-2 px-2 text-[12px] font-normal tabular-nums text-ink-dim">{qtd}</span>
      </h2>
      {children}
      {qtd === 0 && <p className="m-0 py-4 text-center text-[12.5px] italic text-ink-faint">Arraste uma tarefa para cá.</p>}
    </section>
  );
}

function CartaoArrastavel({
  t,
  equipe,
  agora,
  hoje,
  onAbrir,
  onTrocar,
}: {
  t: Tarefa;
  equipe: Pessoa[];
  agora: string;
  hoje: string;
  onAbrir: () => void;
  onTrocar: (p: Pessoa | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-manipulation", isDragging && "opacity-30")}
      onClick={onAbrir}
      {...attributes}
      {...listeners}
      aria-label={`Tarefa "${t.titulo}". Clique para editar; arraste para mover.`}
    >
      <Cartao t={t} agora={agora} hoje={hoje} equipe={equipe} onTrocar={onTrocar} />
    </div>
  );
}

function Cartao({
  t,
  agora,
  hoje,
  equipe,
  onTrocar,
  flutuando,
}: {
  t: Tarefa;
  agora: string;
  hoje: string;
  equipe?: Pessoa[];
  onTrocar?: (p: Pessoa | null) => void;
  flutuando?: boolean;
}) {
  const feito = t.status === "feito";
  const atrasada = estaAtrasada(t, agora);
  const vinculo = textoVinculo(t);
  return (
    <article
      className={cn(
        "flex cursor-grab items-start gap-2 rounded-xl border bg-bg-raised p-3 active:cursor-grabbing",
        atrasada ? "border-[rgb(var(--tag-vermelho)/0.55)]" : "border-line-soft",
        flutuando && "rotate-2 bg-[#0d1b20] shadow-2xl",
      )}
    >
      {!flutuando && <BotaoConcluir id={t.id} concluida={feito} />}
      <div className="min-w-0 flex-1">
        <h3 className={cn("m-0 text-[13.5px] font-medium leading-snug", feito ? "text-ink-faint line-through" : "text-white")}>{t.titulo}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={cn("rounded-full border px-2 py-0.5", COR_PRIORIDADE[t.prioridade])}>{NOME_PRIORIDADE[t.prioridade]}</span>
          {t.area && <span className="rounded-full border border-line px-2 py-0.5 text-ink-dim">{t.area}</span>}
          {vinculo && <span className="rounded-full border border-line px-2 py-0.5 text-ink-dim">{vinculo}</span>}
          {t.prazo && (
            <span className={cn("tabular-nums", atrasada ? "font-medium text-[rgb(var(--tag-vermelho))]" : "text-ink-dim")}>
              {atrasada ? "⚠ " : ""}
              {formatarData(t.prazo, hoje, t.prazo_hora)}
            </span>
          )}
          <span className="ml-auto">
            {equipe && onTrocar ? <MenuResponsavel t={t} equipe={equipe} onTrocar={onTrocar} /> : <Bolinha pessoa={t.responsavel} />}
          </span>
        </div>
      </div>
    </article>
  );
}

function Bolinha({ pessoa }: { pessoa: Pessoa | null }) {
  if (!pessoa) {
    return <span className="grid size-6 place-items-center rounded-full border border-dashed border-line text-[11px] text-ink-faint">?</span>;
  }
  return (
    <span
      className="grid size-6 place-items-center rounded-full text-[11px] font-semibold text-[#041014]"
      style={{ background: `rgb(var(--tag-${corDaPessoa(pessoa.nome)}))` }}
    >
      {pessoa.nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

// Clique na bolinha: mini menu para trocar o responsável, sem abrir o modal.
function MenuResponsavel({ t, equipe, onTrocar }: { t: Tarefa; equipe: Pessoa[]; onTrocar: (p: Pessoa | null) => void }) {
  const parar = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={t.responsavel ? `Responsável: ${t.responsavel.nome} (clique para trocar)` : "Sem responsável (clique para escolher)"}
        aria-label={t.responsavel ? `Responsável: ${t.responsavel.nome}. Trocar` : "Escolher responsável"}
        className="rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={parar}
        onPointerDown={parar}
        onTouchStart={parar}
        onKeyDown={parar}
      >
        <Bolinha pessoa={t.responsavel} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem] border-line bg-[#0a1418] text-ink" onClick={parar}>
        {[...equipe, null].map((p) => (
          <DropdownMenuItem
            key={p?.id ?? "ninguem"}
            onSelect={() => onTrocar(p)}
            className={cn("flex cursor-pointer items-center gap-2 text-[13px] focus:bg-bg-raised-2", (t.responsavel?.id ?? null) === (p?.id ?? null) && "text-white")}
          >
            <Bolinha pessoa={p} />
            {p?.nome ?? "Sem responsável"}
            {(t.responsavel?.id ?? null) === (p?.id ?? null) && <span className="ml-auto text-ink-faint">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
