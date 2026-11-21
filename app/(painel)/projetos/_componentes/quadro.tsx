"use client";

// Kanban de Projetos (fase 2): uma coluna por estado da iniciativa (Ideia · Planejando · Em andamento ·
// No ar · Pausado). Arrasta para outra coluna ou posição (mouse, toque com leve atraso e teclado); ao
// soltar grava coluna + posição numa atualização só e, com erro, volta ao que está no banco. Clicar no
// cartão abre o painel com tudo da iniciativa. Mesmo jeito do quadro de Tarefas (arquivado).

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Etiqueta, type CorEtiqueta } from "@/components/ui/etiqueta";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Frente, Iniciativa, Pessoa } from "@/modulos/gestao/dados";
import { COLUNAS, diasAte, ordemEntre, textoPrazo, type Coluna } from "@/modulos/gestao/regras";
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
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, Plus } from "lucide-react";
import { useActionState, useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { criarIniciativa, moverIniciativa } from "../acoes";
import { DetalheIniciativa } from "./detalhe";

type Ajuste = { coluna: Coluna; ordem: number };

const embaixoDoPonteiro: CollisionDetection = (args) => {
  const sob = pointerWithin(args);
  return sob.length ? sob : closestCorners(args);
};
const ehColunaId = (id: unknown): id is Coluna => COLUNAS.some((c) => c.id === id);

export function Quadro({ itens, frentes, pessoas, hoje, abrir }: { itens: Iniciativa[]; frentes: Frente[]; pessoas: Pessoa[]; hoje: string; abrir: number | null }) {
  const [base, setBase] = useState(itens);
  const [ajustes, setAjustes] = useState<Map<number, Ajuste>>(new Map());
  if (base !== itens) {
    setBase(itens);
    setAjustes(new Map());
  }
  const [arrasto, setArrasto] = useState<{ id: number } & Ajuste | null>(null);
  const [ativaId, setAtivaId] = useState<number | null>(null);
  const [abertaId, setAbertaId] = useState<number | null>(abrir);
  const [frente, setFrente] = useState<number | "todas">("todas");
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const idDnd = useId();

  const lista = useMemo(
    () =>
      itens.map((t) => {
        const a = ajustes.get(t.id);
        const c = a ? { ...t, ...a } : t;
        return arrasto?.id === t.id ? { ...c, coluna: arrasto.coluna, ordem: arrasto.ordem } : c;
      }),
    [itens, ajustes, arrasto],
  );
  const visiveis = useMemo(() => (frente === "todas" ? lista : lista.filter((t) => t.frente_id === frente)), [lista, frente]);
  const porColuna = useMemo(() => {
    const m = {} as Record<Coluna, Iniciativa[]>;
    for (const c of COLUNAS) m[c.id] = visiveis.filter((t) => t.coluna === c.id).sort((a, b) => a.ordem - b.ordem);
    return m;
  }, [visiveis]);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const colunaDe = (id: unknown): Coluna | undefined => (ehColunaId(id) ? id : lista.find((t) => t.id === id)?.coluna);

  function aoComecar({ active }: DragStartEvent) {
    setErro(null);
    setAtivaId(Number(active.id));
  }

  function aoPassar({ active, over }: DragOverEvent) {
    if (!over) return;
    const destino = colunaDe(over.id);
    const atual = lista.find((t) => t.id === active.id);
    if (!destino || !atual || atual.coluna === destino) return;
    const alvo = lista.find((t) => t.id === over.id);
    setArrasto({ id: atual.id, coluna: destino, ordem: alvo ? alvo.ordem - 0.0001 : Number.MAX_SAFE_INTEGER });
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
    const col = porColuna[destino];
    const de = col.findIndex((t) => t.id === id);
    const para = ehColunaId(over!.id) ? col.length - 1 : col.findIndex((t) => t.id === over!.id);
    const nova = de === -1 ? col : arrayMove(col, de, para === -1 ? de : para);
    const i = nova.findIndex((t) => t.id === id);
    const igual = (ajustes.get(id)?.coluna ?? original.coluna) === destino && de === i;
    setArrasto(null);
    if (i === -1 || igual) return;
    const ordem = ordemEntre(nova[i - 1]?.ordem, nova[i + 1]?.ordem);
    setAjustes((m) => new Map(m).set(id, { coluna: destino, ordem }));
    iniciar(async () => {
      const r = await moverIniciativa(id, destino, ordem);
      if (r.erro) {
        setErro(r.erro);
        setAjustes((m) => {
          const n = new Map(m);
          n.delete(id);
          return n;
        });
      }
    });
  }

  const fechar = useCallback(() => {
    setAbertaId(null);
    // tira o ?i= do endereço sem recarregar
    if (location.search) history.replaceState(null, "", location.pathname);
  }, []);
  const ativa = ativaId === null ? null : lista.find((t) => t.id === ativaId);
  const aberta = abertaId === null ? null : itens.find((t) => t.id === abertaId);

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap gap-1.5" aria-label="Filtro por frente">
        {[{ id: "todas" as const, nome: "Todas as frentes" }, ...frentes].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFrente(f.id)}
            aria-pressed={frente === f.id}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
              frente === f.id ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
            )}
          >
            {f.nome}
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
        <div className="-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 pb-2 xl:mx-0 xl:grid xl:grid-cols-5 xl:overflow-visible xl:px-0">
          {COLUNAS.map((c) => (
            <ColunaQuadro key={c.id} id={c.id} nome={c.nome} cor={c.cor} qtd={porColuna[c.id].length}>
              <NovaIniciativa coluna={c.id} frenteId={frente === "todas" ? null : frente} />
              <SortableContext items={porColuna[c.id].map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {porColuna[c.id].map((t) => (
                  <CartaoArrastavel key={t.id} t={t} frentes={frentes} pessoas={pessoas} hoje={hoje} onAbrir={() => setAbertaId(t.id)} />
                ))}
              </SortableContext>
            </ColunaQuadro>
          ))}
        </div>
        <DragOverlay>{ativa ? <Cartao t={ativa} frentes={frentes} pessoas={pessoas} hoje={hoje} flutuando /> : null}</DragOverlay>
      </DndContext>

      {aberta && <DetalheIniciativa key={aberta.id} i={aberta} frentes={frentes} pessoas={pessoas} hoje={hoje} onFechar={fechar} />}
    </div>
  );
}

function ColunaQuadro({ id, nome, cor, qtd, children }: { id: Coluna; nome: string; cor: string; qtd: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={nome}
      className={cn(
        "flex min-h-[280px] w-[78vw] max-w-[300px] shrink-0 snap-start flex-col gap-2 rounded-[18px] border border-line-soft bg-bg-raised/60 p-2.5 transition-colors xl:w-auto xl:max-w-none",
        isOver && "border-accent/60 bg-accent/5",
      )}
    >
      <h2 className="flex items-center gap-2 px-1.5 pb-1 pt-0.5 text-[13px] font-semibold text-white">
        <span className="size-2 rounded-full" style={{ background: `rgb(var(--tag-${cor}))` }} />
        {nome}
        <span className="ml-auto text-[12px] font-normal tabular-nums text-ink-faint">{qtd}</span>
      </h2>
      {children}
    </section>
  );
}

function CartaoArrastavel(props: { t: Iniciativa; frentes: Frente[]; pessoas: Pessoa[]; hoje: string; onAbrir: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.t.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-30")} {...attributes} {...listeners}>
      <Cartao {...props} />
    </div>
  );
}

const COR_FRENTE: CorEtiqueta[] = ["azul", "roxo", "verde", "laranja", "cinza"];

function Cartao({ t, frentes, pessoas, hoje, onAbrir, flutuando = false }: { t: Iniciativa; frentes: Frente[]; pessoas: Pessoa[]; hoje: string; onAbrir?: () => void; flutuando?: boolean }) {
  const iFrente = frentes.findIndex((f) => f.id === t.frente_id);
  const frente = iFrente >= 0 ? frentes[iFrente] : null;
  const dono = pessoas.find((p) => p.id === t.dono_id)?.nome;
  const feitos = t.itens.filter((x) => x.feito_em).length;
  const atrasado = t.prazo != null && diasAte(t.prazo, hoje) < 0 && t.coluna !== "no_ar" && t.coluna !== "pausado";
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "glass-lite flex w-full flex-col gap-2 p-3 text-left",
        flutuando && "rotate-[1.5deg] shadow-2xl",
        atrasado && "border-[rgb(var(--tag-vermelho)/0.5)]",
      )}
    >
      <span className="text-[13.5px] font-semibold leading-snug text-white">{t.titulo}</span>
      {t.objetivo && <span className="line-clamp-2 text-[12px] leading-snug text-ink-dim">{t.objetivo}</span>}
      <span className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        {frente && <Etiqueta cor={COR_FRENTE[iFrente % COR_FRENTE.length]}>{frente.nome}</Etiqueta>}
        {t.itens.length > 0 && (
          <span className="flex items-center gap-1 tabular-nums text-ink-faint">
            <CheckSquare size={12} aria-hidden /> {feitos}/{t.itens.length}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {t.prazo && <span className={atrasado ? "text-[rgb(var(--tag-vermelho))]" : "text-ink-faint"}>{textoPrazo(t.prazo, hoje)}</span>}
          {dono && (
            <span title={dono} className="grid size-5 place-items-center rounded-full bg-bg-raised-2 text-[10px] font-semibold text-ink">
              {dono.slice(0, 1)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function NovaIniciativa({ coluna, frenteId }: { coluna: Coluna; frenteId: number | null }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarIniciativa, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // continua aberto para emendar outra (Esc fecha)
    if (estado.ok) form.current?.reset();
  }, [estado]);
  if (!aberto)
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[12px] text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-white"
      >
        <Plus size={13} aria-hidden /> Nova iniciativa
      </button>
    );
  return (
    <form ref={form} action={acao} className="flex flex-col gap-1.5">
      <input type="hidden" name="coluna" value={coluna} />
      {frenteId && <input type="hidden" name="frente_id" value={frenteId} />}
      <Input name="titulo" placeholder="Título (Enter salva)" maxLength={160} autoFocus required onKeyDown={(e) => e.key === "Escape" && setAberto(false)} disabled={pendente} />
      <Aviso estado={estado.erro ? estado : {}} />
    </form>
  );
}

