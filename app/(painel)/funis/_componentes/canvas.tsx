"use client";

// Canvas de um funil (fase 3) com React Flow: blocos e setas, zoom, arrastar, minimapa e fundo
// pontilhado. Clicar num bloco abre o painel de edição; clicar numa seta edita o rótulo. Arrastar um
// bloco salva a posição; ao abrir, o funil se ajusta à tela. "+ Bloco" cria no meio
// da tela; puxar de uma bolinha do bloco até outro bloco liga os dois. Exportar PNG gera a imagem do
// funil inteiro. Docs: reactflow.dev (v12) e o exemplo oficial "download image" (html-to-image 1.11.11).

import "@xyflow/react/dist/style.css";
import { Aviso, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { PainelLateral } from "@/components/painel-lateral";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Bloco, Ligacao, Mapa } from "@/modulos/gestao/dados";
import { faixaDePreco, figmaEmbed, STATUS_BLOCO, TIPOS_BLOCO, type StatusBloco } from "@/modulos/gestao/regras";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { ArrowUpRight, Download, Figma, Plus, StickyNote, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BotaoIcone } from "../../_componentes/hoje/prioridades";
import { apagarBloco, apagarLigacao, criarBloco, ligarBlocos, moverBlocos, rotularLigacao, salvarBloco, salvarFigma } from "../acoes";

type DadosBloco = Bloco & { abre: Mapa | null };
type NoBloco = Node<DadosBloco, "bloco">;

const COR_STATUS: Record<StatusBloco, string> = Object.fromEntries(STATUS_BLOCO.map((s) => [s.id, `rgb(var(--tag-${s.cor}))`])) as Record<StatusBloco, string>;
const NOME_TIPO = Object.fromEntries(TIPOS_BLOCO.map((t) => [t.id, t.nome]));
const LARGURA = 208;
const ALTURA = 92; // aproximada, só para escolher o lado da seta

const classeTexto =
  "w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// ---------------------------------------------------------------------------
// bloco
// ---------------------------------------------------------------------------
const LADOS = [
  { id: "top", pos: Position.Top },
  { id: "right", pos: Position.Right },
  { id: "bottom", pos: Position.Bottom },
  { id: "left", pos: Position.Left },
] as const;

function NoDoFunil({ data, selected }: NodeProps<NoBloco>) {
  const preco = faixaDePreco(data.preco, data.preco_ate);
  const ehFunil = data.tipo === "funil";
  return (
    <div
      className={cn(
        "group relative rounded-[14px] border bg-[#0b1417] text-left shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-colors",
        selected ? "border-accent" : ehFunil ? "border-accent/40" : "border-line",
      )}
      style={{ width: LARGURA }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] rounded-l-[14px]" style={{ background: COR_STATUS[data.status] }} aria-hidden />
      <div className="flex flex-col gap-1 py-2.5 pl-4 pr-3">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          <span className="size-1.5 rounded-full" style={{ background: COR_STATUS[data.status] }} aria-hidden />
          {NOME_TIPO[data.tipo]}
          {data.nota && <StickyNote size={11} className="ml-auto text-ink-dim" aria-label="tem nota" />}
        </span>
        <span className={cn("font-semibold leading-snug text-white", ehFunil ? "text-[15px]" : "text-[13.5px]")}>{data.nome}</span>
        {(preco || data.numero != null) && (
          <span className="flex items-baseline gap-2 text-[12px] tabular-nums">
            {preco && <span className="text-ink">{preco}</span>}
            {data.numero != null && (
              <span className="ml-auto text-ink-dim" title={data.numero_origem === "prime" ? "do Prime" : "digitado à mão"}>
                {data.numero.toLocaleString("pt-BR")}
              </span>
            )}
          </span>
        )}
        {data.abre && (
          <Link href={`/funis?m=${data.abre.slug}`} onClick={(e) => e.stopPropagation()} className="nodrag mt-0.5 flex items-center gap-1 text-[11.5px] text-accent hover:underline">
            Abrir funil <ArrowUpRight size={12} aria-hidden />
          </Link>
        )}
      </div>
      {LADOS.map((l) => (
        // por cima do conteúdo (z-10) e um pouco maior: é de onde sai a seta para ligar
        <Handle
          key={l.id}
          id={l.id}
          type="source"
          position={l.pos}
          className="!z-10 !size-3 !border-2 !border-[#0b1417] !bg-ink-faint transition-colors group-hover:!bg-accent"
        />
      ))}
    </div>
  );
}
const TIPOS_DE_NO = { bloco: NoDoFunil };

/** De que lado sai e entra a seta, pela posição dos dois blocos (as setas acompanham ao arrastar). */
function lados(de: { x: number; y: number }, para: { x: number; y: number }): { sourceHandle: string; targetHandle: string } {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  if (Math.abs(dy) > ALTURA && Math.abs(dy) * 1.2 > Math.abs(dx)) return dy > 0 ? { sourceHandle: "bottom", targetHandle: "top" } : { sourceHandle: "top", targetHandle: "bottom" };
  return dx >= 0 ? { sourceHandle: "right", targetHandle: "left" } : { sourceHandle: "left", targetHandle: "right" };
}

/** Perto do ponto pedido, o primeiro lugar que não cobre outro bloco (desce e vai para o lado). */
function espacoLivre(p: { x: number; y: number }, ocupados: { x: number; y: number }[]): { x: number; y: number } {
  const bate = (q: { x: number; y: number }) => ocupados.some((o) => Math.abs(o.x - q.x) < LARGURA + 24 && Math.abs(o.y - q.y) < ALTURA + 24);
  for (let anel = 0; anel < 12; anel++)
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]) {
      const q = { x: p.x + dx * anel * (LARGURA + 40), y: p.y + dy * anel * (ALTURA + 40) };
      if (!bate(q)) return q;
    }
  return { x: p.x, y: p.y + 12 * (ALTURA + 40) };
}

// ---------------------------------------------------------------------------
// canvas
// ---------------------------------------------------------------------------
export function CanvasFunil(props: { mapa: Mapa; mapas: Mapa[]; blocos: Bloco[]; ligacoes: Ligacao[] }) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ mapa, mapas, blocos, ligacoes }: { mapa: Mapa; mapas: Mapa[]; blocos: Bloco[]; ligacoes: Ligacao[] }) {
  const rf = useReactFlow();
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [blocoAberto, setBlocoAberto] = useState<number | null>(null);
  const [setaAberta, setSetaAberta] = useState<number | null>(null);
  const [figmaAberto, setFigmaAberto] = useState(false);
  const [figmaAoLado, setFigmaAoLado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const area = useRef<HTMLDivElement>(null);

  const paraNo = useCallback(
    (b: Bloco): NoBloco => ({ id: String(b.id), type: "bloco", position: { x: b.pos_x, y: b.pos_y }, data: { ...b, abre: mapas.find((m) => m.id === b.abre_mapa_id) ?? null } }),
    [mapas],
  );
  // nós: o servidor manda a lista; o arrastar muda só aqui (e salva ao soltar)
  const [base, setBase] = useState(blocos);
  const [nos, setNos] = useState<NoBloco[]>(() => blocos.map(paraNo));
  if (base !== blocos) {
    setBase(blocos);
    setNos((atuais) => blocos.map((b) => ({ ...paraNo(b), selected: atuais.find((n) => n.id === String(b.id))?.selected })));
  }

  const setas: Edge[] = useMemo(() => {
    const pos = new Map(nos.map((n) => [n.id, n.position]));
    return ligacoes
      .filter((l) => pos.has(String(l.de)) && pos.has(String(l.para)))
      .map((l) => ({
        id: String(l.id),
        source: String(l.de),
        target: String(l.para),
        ...lados(pos.get(String(l.de))!, pos.get(String(l.para))!),
        type: "smoothstep",
        label: l.rotulo ?? undefined,
        labelStyle: { fill: "rgba(237,237,237,0.85)", fontSize: 11 },
        labelBgStyle: { fill: "#0b1417" },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "rgba(147,186,222,0.7)" },
        style: { stroke: "rgba(147,186,222,0.55)", strokeWidth: 1.5 },
      }));
  }, [ligacoes, nos]);

  const aoMudarNos = useCallback((m: NodeChange<NoBloco>[]) => setNos((n) => applyNodeChanges(m, n)), []);

  function falhou(r: EstadoForm) {
    if (r.erro) setErro(r.erro);
  }

  const aoSoltarNo = useCallback(
    (_: unknown, _no: NoBloco, soltos: NoBloco[]) => {
      setErro(null);
      iniciar(async () => falhou(await moverBlocos(soltos.map((n) => ({ id: Number(n.id), x: n.position.x, y: n.position.y })))));
    },
    [],
  );

  const aoLigar = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      setErro(null);
      iniciar(async () => falhou(await ligarBlocos(mapa.id, Number(c.source), Number(c.target))));
    },
    [mapa.id],
  );

  function novoBloco() {
    const r = area.current?.getBoundingClientRect();
    const centro = rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 });
    const livre = espacoLivre({ x: centro.x - LARGURA / 2, y: centro.y - ALTURA / 2 }, nos.map((n) => n.position));
    setErro(null);
    iniciar(async () => {
      const res = await criarBloco(mapa.id, "mensagem", livre.x, livre.y);
      if (res.erro) setErro(res.erro);
      else if (res.id) setBlocoAberto(res.id);
    });
  }

  async function exportar() {
    const alvo = area.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!alvo || nos.length === 0) return;
    setExportando(true);
    try {
      const limites = getNodesBounds(nos);
      const largura = Math.min(4000, Math.max(1200, Math.round(limites.width * 1.25 + 160)));
      const altura = Math.min(3000, Math.max(675, Math.round(limites.height * 1.25 + 160)));
      const vp = getViewportForBounds(limites, largura, altura, 0.4, 2, 0.08);
      const png = await toPng(alvo, {
        backgroundColor: "#000607",
        width: largura,
        height: altura,
        pixelRatio: 2,
        style: { width: `${largura}px`, height: `${altura}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
      });
      const a = document.createElement("a");
      a.download = `funil-${mapa.slug}.png`;
      a.href = png;
      a.click();
    } catch {
      setErro("Não deu para gerar a imagem.");
    } finally {
      setExportando(false);
    }
  }

  const aberto = blocoAberto === null ? null : blocos.find((b) => b.id === blocoAberto) ?? null;
  const seta = setaAberta === null ? null : ligacoes.find((l) => l.id === setaAberta) ?? null;
  const nomeDo = (id: number) => blocos.find((b) => b.id === id)?.nome ?? "?";
  const mostrarFigma = figmaAoLado && !!mapa.figma_url;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={novoBloco}>
          <Plus size={14} /> Bloco
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={exportar} disabled={exportando || nos.length === 0}>
          <Download size={14} /> {exportando ? "Gerando…" : "Exportar PNG"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setFigmaAberto(true)}>
          <Figma size={14} /> {mapa.figma_url ? "Figma" : "Ligar Figma"}
        </Button>
        {mapa.figma_url && (
          <label className="flex items-center gap-2 text-[12.5px] text-ink-dim">
            <input type="checkbox" checked={figmaAoLado} onChange={(e) => setFigmaAoLado(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Figma ao lado
          </label>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[11.5px] text-ink-faint">
          {STATUS_BLOCO.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: COR_STATUS[s.id] }} aria-hidden /> {s.nome}
            </span>
          ))}
        </span>
      </div>
      {erro && (
        <p role="alert" className="m-0 text-[13px] text-[rgb(var(--tag-vermelho))]">
          {erro}
        </p>
      )}

      <div className={cn("grid gap-3", mostrarFigma && "lg:grid-cols-2")}>
        <div ref={area} className="h-[min(72vh,760px)] min-h-[420px] overflow-hidden rounded-[18px] border border-line-soft bg-[#03090a]">
          <ReactFlow<NoBloco, Edge>
            nodes={nos}
            edges={setas}
            nodeTypes={TIPOS_DE_NO}
            onNodesChange={aoMudarNos}
            onNodeDragStop={aoSoltarNo}
            onNodeClick={(_, n) => setBlocoAberto(Number(n.id))}
            onEdgeClick={(_, e) => setSetaAberta(Number(e.id))}
            onConnect={aoLigar}
            connectionMode={ConnectionMode.Loose}
            // abre sempre ajustado à tela (a câmera não fica salva: computador e celular são diferentes)
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            deleteKeyCode={null}
            colorMode="dark"
            connectionRadius={48}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(147,186,222,0.22)" bgColor="#03090a" />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              nodeColor={(n) => COR_STATUS[(n.data as DadosBloco).status]}
              maskColor="rgba(0,6,7,0.7)"
              style={{ background: "#071012", width: 160, height: 104 }}
            />
            {nos.length === 0 && (
              <Panel position="top-center">
                <p className="m-0 rounded-full border border-line-soft bg-bg-raised px-4 py-2 text-[12.5px] text-ink-dim">Funil vazio. Use “+ Bloco” para começar.</p>
              </Panel>
            )}
          </ReactFlow>
        </div>
        {mostrarFigma && (
          <iframe
            title={`Figma de ${mapa.nome}`}
            src={figmaEmbed(mapa.figma_url!)}
            className="h-[min(72vh,760px)] min-h-[420px] w-full rounded-[18px] border border-line-soft bg-[#03090a]"
            allowFullScreen
          />
        )}
      </div>
      <p className="m-0 text-[11.5px] text-ink-faint">
        Arraste para mover · role para dar zoom · puxe de uma bolinha até outro bloco para ligar · clique num bloco ou numa seta para editar.
      </p>

      {aberto && <PainelBloco key={aberto.id} b={aberto} mapas={mapas.filter((m) => m.id !== mapa.id)} onFechar={() => setBlocoAberto(null)} />}
      {seta && <PainelSeta key={seta.id} l={seta} de={nomeDo(seta.de)} para={nomeDo(seta.para)} onFechar={() => setSetaAberta(null)} />}
      {figmaAberto && <PainelFigma mapa={mapa} onFechar={() => setFigmaAberto(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// painéis
// ---------------------------------------------------------------------------
function PainelBloco({ b, mapas, onFechar }: { b: Bloco; mapas: Mapa[]; onFechar: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarBloco, {});
  const [apagando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const rotulo = "flex flex-col gap-1 text-[12px] text-ink-dim";
  const links = b.links.map((l) => `${l.titulo} | ${l.url}`).join("\n");
  return (
    <PainelLateral
      onFechar={onFechar}
      titulo={
        <>
          <p className="m-0 text-[11.5px] text-ink-faint">Bloco do funil</p>
          <h2 className="mt-0.5 text-[18px] font-semibold text-white">{b.nome}</h2>
        </>
      }
      acoes={
        <BotaoIcone
          rotulo="Apagar bloco"
          disabled={apagando}
          onClick={() => {
            if (!confirm(`Apagar "${b.nome}" e as setas dele?`)) return;
            iniciar(async () => {
              const r = await apagarBloco(b.id);
              if (r.erro) setErro(r.erro);
              else onFechar();
            });
          }}
        >
          <Trash2 size={15} />
        </BotaoIcone>
      }
    >
      <form action={acao} className="grid grid-cols-2 gap-3">
        <input type="hidden" name="id" value={b.id} />
        <label className={cn(rotulo, "col-span-2")}>
          Nome
          <Input name="nome" defaultValue={b.nome} maxLength={80} required autoFocus={b.nome === "Novo bloco"} />
        </label>
        <label className={rotulo}>
          Tipo
          <select name="tipo" defaultValue={b.tipo} className={classeSelect}>
            {TIPOS_BLOCO.map((t) => (
              <option key={t.id} value={t.id} className={classeOpcao}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Status
          <select name="status" defaultValue={b.status} className={classeSelect}>
            {STATUS_BLOCO.map((s) => (
              <option key={s.id} value={s.id} className={classeOpcao}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Preço (se for oferta)
          <Input name="preco" inputMode="decimal" defaultValue={b.preco == null ? "" : String(b.preco).replace(".", ",")} placeholder="R$" />
        </label>
        <label className={rotulo}>
          Até (faixa, opcional)
          <Input name="preco_ate" inputMode="decimal" defaultValue={b.preco_ate == null ? "" : String(b.preco_ate).replace(".", ",")} placeholder="R$" />
        </label>
        <label className={rotulo}>
          Número da etapa
          <Input name="numero" inputMode="numeric" defaultValue={b.numero ?? ""} placeholder="ex.: quantos chegaram" />
        </label>
        <label className={rotulo}>
          Abre o funil
          <select name="abre_mapa_id" defaultValue={b.abre_mapa_id ?? ""} className={classeSelect}>
            <option value="" className={classeOpcao}>
              —
            </option>
            {mapas.map((m) => (
              <option key={m.id} value={m.id} className={classeOpcao}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <label className={cn(rotulo, "col-span-2")}>
          Nota (gancho, roteiro curto)
          <textarea name="nota" rows={5} maxLength={4000} defaultValue={b.nota ?? ""} className={classeTexto} placeholder="O gancho deste bloco" />
        </label>
        <label className={cn(rotulo, "col-span-2")}>
          Links (um por linha: Nome | https://…)
          <textarea name="links" rows={3} defaultValue={links} className={cn(classeTexto, "font-mono text-[12.5px]")} placeholder={"Roteiro | https://docs…\nVídeo | https://…\nFigma | https://figma.com/…"} />
        </label>
        {b.links.length > 0 && (
          <ul className="col-span-2 flex flex-wrap gap-2">
            {b.links.map((l, i) => (
              <li key={i}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[12px] text-ink hover:border-accent/60 hover:text-white">
                  {l.titulo} <ArrowUpRight size={12} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar"}
          </Button>
          <Aviso estado={estado} />
        </div>
        {b.numero_origem === "prime" && <p className="col-span-2 m-0 text-[12px] text-ink-faint">O número desta etapa vem do Prime.</p>}
        {erro && <p className="col-span-2 m-0 text-[12.5px] text-[rgb(var(--tag-vermelho))]">{erro}</p>}
      </form>
    </PainelLateral>
  );
}

function PainelSeta({ l, de, para, onFechar }: { l: Ligacao; de: string; para: string; onFechar: () => void }) {
  const [rotulo, setRotulo] = useState(l.rotulo ?? "");
  const [pendente, iniciar] = useTransition();
  const [estado, setEstado] = useState<EstadoForm>({});
  return (
    <PainelLateral
      onFechar={onFechar}
      titulo={
        <>
          <p className="m-0 text-[11.5px] text-ink-faint">Seta</p>
          <h2 className="mt-0.5 text-[16px] font-semibold text-white">
            {de} → {para}
          </h2>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            const r = await rotularLigacao(l.id, rotulo);
            setEstado(r);
            if (r.ok) onFechar();
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
          Rótulo (opcional)
          <Input value={rotulo} onChange={(e) => setRotulo(e.target.value)} maxLength={60} placeholder="ex.: não comprou, sem dinheiro" autoFocus />
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pendente}>
            Salvar
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await apagarLigacao(l.id);
                setEstado(r);
                if (r.ok) onFechar();
              })
            }
          >
            <Trash2 size={14} /> Apagar seta
          </Button>
          <Aviso estado={estado.erro ? estado : {}} />
        </div>
      </form>
    </PainelLateral>
  );
}

function PainelFigma({ mapa, onFechar }: { mapa: Mapa; onFechar: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarFigma, {});
  useEffect(() => {
    if (estado.ok) onFechar();
  }, [estado, onFechar]);
  return (
    <PainelLateral onFechar={onFechar} titulo={<h2 className="text-[16px] font-semibold text-white">Figma / FigJam de {mapa.nome}</h2>}>
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="mapa_id" value={mapa.id} />
        <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
          Link do arquivo (vazio tira)
          <Input name="figma_url" type="url" defaultValue={mapa.figma_url ?? ""} placeholder="https://www.figma.com/board/…" />
        </label>
        <p className="m-0 text-[12px] leading-relaxed text-ink-faint">
          Para desenhar algo mais livre. Com o link salvo, marque “Figma ao lado” para abrir o arquivo junto do canvas. O arquivo precisa estar compartilhado com quem for ver.
        </p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pendente}>
            Salvar
          </Button>
          {mapa.figma_url && (
            <a href={mapa.figma_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12.5px] text-ink-dim hover:text-white">
              Abrir no Figma <ArrowUpRight size={13} aria-hidden />
            </a>
          )}
          <Aviso estado={estado.erro ? estado : {}} />
        </div>
      </form>
    </PainelLateral>
  );
}
