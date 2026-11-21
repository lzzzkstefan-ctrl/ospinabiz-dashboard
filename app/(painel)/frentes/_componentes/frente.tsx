"use client";

// Página de uma frente (fase 3): dados (objetivo, meta, público, canal, estratégia, status), escada de
// ofertas, influencers (Viral) e notas livres. Leitura por padrão; "Editar" abre o formulário no lugar.

import { Aviso, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { PainelLateral } from "@/components/painel-lateral";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FrenteCompleta, Influencer, Oferta } from "@/modulos/gestao/dados";
import { faixaDePreco, formatarBRL, NOME_REMUNERACAO, NOME_TIPO_OFERTA, STATUS_FRENTE, type StatusFrente } from "@/modulos/gestao/regras";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { BotaoIcone } from "../../_componentes/hoje/prioridades";
import { apagarInfluencer, apagarOferta, salvarFrente, salvarInfluencer, salvarNotasFrente, salvarOferta } from "../acoes";

export const classeTexto =
  "w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const brlOuVazio = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

export function Titulo({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-[15px] font-semibold text-white">{children}</h2>
      {acao && <span className="ml-auto">{acao}</span>}
    </div>
  );
}

function LinkAcao({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 text-[12.5px] text-ink-dim transition-colors hover:text-white">
      {children}
    </button>
  );
}

// ---------- dados da frente ----------
export function DadosFrente({ f, real }: { f: FrenteCompleta; real: { vendas: number; liquido: number } | null }) {
  const [editando, setEditando] = useState(false);
  const pct = real && f.meta_mensal ? Math.min(100, Math.round((real.liquido / f.meta_mensal) * 100)) : null;
  return (
    <section>
      <Titulo acao={!editando && <LinkAcao onClick={() => setEditando(true)}><Pencil size={13} /> Editar</LinkAcao>}>Estratégia</Titulo>
      {editando ? (
        <FormFrente f={f} onPronto={() => setEditando(false)} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="glass-lite glass-static p-4">
            <p className="m-0 text-[11px] uppercase tracking-[0.12em] text-ink-faint">Meta do mês (faturamento líquido)</p>
            {f.meta_mensal == null ? (
              <p className="m-0 mt-1 text-[13px] text-ink-dim">Sem meta definida.</p>
            ) : (
              <p className="m-0 mt-1 text-[24px] font-semibold tabular-nums text-white">{formatarBRL(f.meta_mensal)}</p>
            )}
            {real ? (
              <>
                <p className="m-0 mt-1 text-[13px] tabular-nums text-ink-dim">
                  Real no mês: <span className="text-ink">{formatarBRL(real.liquido)}</span> · {real.vendas} {real.vendas === 1 ? "venda" : "vendas"}
                  {pct != null && ` · ${pct}%`}
                </p>
                {pct != null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-raised-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Meta do mês">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </>
            ) : (
              <p className="m-0 mt-1 text-[12px] text-ink-faint">Ainda sem vendas ligadas a esta frente.</p>
            )}
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Objetivo" valor={f.objetivo} largo />
            <Campo rotulo="Público" valor={f.publico} />
            <Campo rotulo="Canal de aquisição" valor={f.canal} />
            <Campo rotulo="Como funciona" valor={f.estrategia} largo />
          </dl>
        </div>
      )}
    </section>
  );
}

function Campo({ rotulo, valor, largo = false }: { rotulo: string; valor: string | null; largo?: boolean }) {
  return (
    <div className={cn(largo && "sm:col-span-2")}>
      <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">{rotulo}</dt>
      <dd className={cn("m-0 mt-1 whitespace-pre-wrap text-[14px] leading-relaxed", valor ? "text-ink" : "text-ink-faint")}>{valor ?? "—"}</dd>
    </div>
  );
}

function FormFrente({ f, onPronto }: { f: FrenteCompleta; onPronto: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarFrente, {});
  useEffect(() => {
    if (estado.ok) onPronto();
  }, [estado, onPronto]);
  return (
    <form action={acao} className="glass-lite glass-static flex flex-col gap-3 p-4">
      <input type="hidden" name="id" value={f.id} />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
          Status
          <select name="status" defaultValue={f.status} className={classeSelect}>
            {(Object.keys(STATUS_FRENTE) as StatusFrente[]).map((s) => (
              <option key={s} value={s} className={classeOpcao}>
                {STATUS_FRENTE[s].nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
          Meta do mês (R$)
          <Input name="meta_mensal" inputMode="decimal" defaultValue={brlOuVazio(f.meta_mensal)} placeholder="0,00" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Objetivo
        <textarea name="objetivo" rows={2} maxLength={500} defaultValue={f.objetivo ?? ""} className={classeTexto} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Público
        <textarea name="publico" rows={2} maxLength={1000} defaultValue={f.publico ?? ""} className={classeTexto} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Canal de aquisição
        <textarea name="canal" rows={2} maxLength={1000} defaultValue={f.canal ?? ""} className={classeTexto} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-dim">
        Como funciona
        <textarea name="estrategia" rows={4} maxLength={4000} defaultValue={f.estrategia ?? ""} className={classeTexto} />
      </label>
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

// ---------- escada de ofertas ----------
export function Ofertas({ frenteId, ofertas }: { frenteId: number; ofertas: Oferta[] }) {
  const [editando, setEditando] = useState<number | "nova" | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <section>
      <Titulo acao={editando !== "nova" && <LinkAcao onClick={() => setEditando("nova")}><Plus size={13} /> Oferta</LinkAcao>}>Oferta e escada de preços</Titulo>
      {ofertas.length === 0 && editando !== "nova" && <p className="m-0 border-y border-line-soft py-3 text-[13px] text-ink-faint">Nenhuma oferta ainda.</p>}
      <ol className="flex flex-col">
        {ofertas.map((o) =>
          editando === o.id ? (
            <li key={o.id} className="py-2">
              <FormOferta frenteId={frenteId} o={o} onPronto={() => setEditando(null)} />
            </li>
          ) : (
            <li key={o.id} className="group relative flex items-center gap-3 border-l border-line py-2.5 pl-5">
              <span className={cn("absolute -left-[5px] size-2.5 rounded-full border-2 border-background", o.tipo === "front" ? "bg-accent" : o.tipo === "upsell" ? "bg-[rgb(var(--tag-verde))]" : "bg-ink-faint")} aria-hidden />
              <span className="w-[74px] shrink-0 text-[11.5px] uppercase tracking-[0.08em] text-ink-faint">{NOME_TIPO_OFERTA[o.tipo]}</span>
              <span className="min-w-0 flex-1">
                <span className="text-[14px] text-white">{o.nome}</span>
                {o.condicao && <span className="block text-[12px] text-ink-faint">{o.condicao}</span>}
              </span>
              <span className="shrink-0 text-[14px] font-semibold tabular-nums text-white">{faixaDePreco(o.preco, o.preco_ate) ?? "—"}</span>
              <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <BotaoIcone rotulo="Editar oferta" onClick={() => setEditando(o.id)}>
                  <Pencil size={13} />
                </BotaoIcone>
                <BotaoIcone
                  rotulo="Apagar oferta"
                  disabled={pendente}
                  onClick={() => {
                    if (confirm(`Apagar "${o.nome} ${faixaDePreco(o.preco, o.preco_ate) ?? ""}"?`)) iniciar(async () => void (await apagarOferta(o.id)));
                  }}
                >
                  <Trash2 size={13} />
                </BotaoIcone>
              </span>
            </li>
          ),
        )}
      </ol>
      {editando === "nova" && <FormOferta frenteId={frenteId} onPronto={() => setEditando(null)} />}
    </section>
  );
}

function FormOferta({ frenteId, o, onPronto }: { frenteId: number; o?: Oferta; onPronto: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarOferta, {});
  useEffect(() => {
    if (estado.ok) onPronto();
  }, [estado, onPronto]);
  return (
    <form action={acao} className="glass-lite glass-static mt-2 grid grid-cols-6 gap-2 p-3 max-sm:grid-cols-2">
      {o && <input type="hidden" name="id" value={o.id} />}
      <input type="hidden" name="frente_id" value={frenteId} />
      <select name="tipo" defaultValue={o?.tipo ?? "front"} aria-label="Tipo" className={cn(classeSelect, "col-span-1 max-sm:col-span-1")}>
        {Object.entries(NOME_TIPO_OFERTA).map(([id, nome]) => (
          <option key={id} value={id} className={classeOpcao}>
            {nome}
          </option>
        ))}
      </select>
      <Input name="nome" defaultValue={o?.nome} placeholder="Nome" required maxLength={120} className="col-span-3 max-sm:col-span-1" />
      <Input name="preco" inputMode="decimal" defaultValue={brlOuVazio(o?.preco ?? null)} placeholder="Preço" aria-label="Preço" />
      <Input name="preco_ate" inputMode="decimal" defaultValue={brlOuVazio(o?.preco_ate ?? null)} placeholder="até (opcional)" aria-label="Preço até" />
      <Input name="condicao" defaultValue={o?.condicao ?? ""} placeholder="Quando entra (opcional)" maxLength={300} className="col-span-4 max-sm:col-span-2" />
      <div className="col-span-2 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          Salvar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onPronto}>
          Cancelar
        </Button>
      </div>
      <div className="col-span-6 max-sm:col-span-2">
        <Aviso estado={estado.erro ? estado : {}} />
      </div>
    </form>
  );
}

// ---------- influencers ----------
export function Influencers({ frenteId, lista }: { frenteId: number; lista: Influencer[] }) {
  const [aberto, setAberto] = useState<Influencer | "novo" | null>(null);
  const total = lista.reduce((s, x) => s + (x.vendas ?? 0), 0);
  const custo = lista.reduce((s, x) => s + (x.custo ?? 0), 0);
  return (
    <section>
      <Titulo acao={<LinkAcao onClick={() => setAberto("novo")}><Plus size={13} /> Influencer</LinkAcao>}>Influencers</Titulo>
      {lista.length === 0 ? (
        <p className="m-0 border-y border-line-soft py-3 text-[13px] text-ink-faint">Nenhum influencer ainda. Cada um com nicho, seguidores, contato, custo, link ou cupom e vendas.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line-soft text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                <th className="px-1 py-2 font-medium">Influencer</th>
                <th className="px-1 py-2 font-medium">Nicho</th>
                <th className="px-1 py-2 text-right font-medium">Seguidores</th>
                <th className="px-1 py-2 font-medium">Remuneração</th>
                <th className="px-1 py-2 text-right font-medium">Custo</th>
                <th className="px-1 py-2 font-medium">Link / cupom</th>
                <th className="px-1 py-2 text-right font-medium">Vendas</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.id} onClick={() => setAberto(x)} className="cursor-pointer border-b border-line-soft transition-colors hover:bg-bg-raised">
                  <td className="px-1 py-2.5">
                    <span className="text-white">{x.nome}</span>
                    {x.arroba && <span className="block text-[12px] text-ink-faint">{x.arroba}</span>}
                  </td>
                  <td className="px-1 py-2.5 text-ink-dim">{x.nicho ?? "—"}</td>
                  <td className="px-1 py-2.5 text-right tabular-nums text-ink-dim">{x.seguidores?.toLocaleString("pt-BR") ?? "—"}</td>
                  <td className="px-1 py-2.5 text-ink-dim">{x.remuneracao ? NOME_REMUNERACAO[x.remuneracao] : "—"}</td>
                  <td className="px-1 py-2.5 text-right tabular-nums text-ink-dim">{x.custo == null ? "—" : formatarBRL(x.custo)}</td>
                  <td className="px-1 py-2.5 text-ink-dim">
                    {x.cupom && <span className="font-mono text-[12px] text-ink">{x.cupom}</span>}
                    {x.link && (
                      <a href={x.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-2 inline-flex items-center gap-1 hover:text-white">
                        <ExternalLink size={12} aria-hidden /> link
                      </a>
                    )}
                    {!x.cupom && !x.link && "—"}
                  </td>
                  <td className="px-1 py-2.5 text-right tabular-nums text-white">{x.vendas ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-[12px] text-ink-dim">
                <td className="px-1 py-2" colSpan={4}>
                  {lista.length} {lista.length === 1 ? "influencer" : "influencers"}
                </td>
                <td className="px-1 py-2 text-right tabular-nums">{formatarBRL(custo)}</td>
                <td />
                <td className="px-1 py-2 text-right tabular-nums">{total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {aberto && <PainelInfluencer key={aberto === "novo" ? "novo" : aberto.id} frenteId={frenteId} x={aberto === "novo" ? undefined : aberto} onFechar={() => setAberto(null)} />}
    </section>
  );
}

function PainelInfluencer({ frenteId, x, onFechar }: { frenteId: number; x?: Influencer; onFechar: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarInfluencer, {});
  const [apagando, iniciar] = useTransition();
  useEffect(() => {
    if (estado.ok) onFechar();
  }, [estado, onFechar]);
  const rotulo = "flex flex-col gap-1 text-[12px] text-ink-dim";
  return (
    <PainelLateral
      onFechar={onFechar}
      titulo={<h2 className="text-[18px] font-semibold text-white">{x ? x.nome : "Novo influencer"}</h2>}
      acoes={
        x && (
          <BotaoIcone
            rotulo="Apagar influencer"
            disabled={apagando}
            onClick={() => {
              if (confirm(`Apagar ${x.nome}?`)) iniciar(async () => void ((await apagarInfluencer(x.id)).ok && onFechar()));
            }}
          >
            <Trash2 size={15} />
          </BotaoIcone>
        )
      }
    >
      <form action={acao} className="grid grid-cols-2 gap-3">
        {x && <input type="hidden" name="id" value={x.id} />}
        <input type="hidden" name="frente_id" value={frenteId} />
        <label className={rotulo}>
          Nome
          <Input name="nome" defaultValue={x?.nome} required maxLength={120} autoFocus />
        </label>
        <label className={rotulo}>
          @
          <Input name="arroba" defaultValue={x?.arroba ?? ""} maxLength={80} placeholder="@perfil" />
        </label>
        <label className={rotulo}>
          Nicho
          <Input name="nicho" defaultValue={x?.nicho ?? ""} maxLength={120} />
        </label>
        <label className={rotulo}>
          Seguidores
          <Input name="seguidores" inputMode="numeric" defaultValue={x?.seguidores ?? ""} />
        </label>
        <label className={cn(rotulo, "col-span-2")}>
          Contato
          <Input name="contato" defaultValue={x?.contato ?? ""} maxLength={200} placeholder="WhatsApp, e-mail ou empresário" />
        </label>
        <label className={rotulo}>
          Remuneração
          <select name="remuneracao" defaultValue={x?.remuneracao ?? ""} className={classeSelect}>
            <option value="" className={classeOpcao}>
              —
            </option>
            {Object.entries(NOME_REMUNERACAO).map(([id, nome]) => (
              <option key={id} value={id} className={classeOpcao}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Custo (R$)
          <Input name="custo" inputMode="decimal" defaultValue={brlOuVazio(x?.custo ?? null)} placeholder="0,00" />
        </label>
        <label className={cn(rotulo, "col-span-2")}>
          Link
          <Input name="link" type="url" defaultValue={x?.link ?? ""} placeholder="https://…" />
        </label>
        <label className={rotulo}>
          Cupom
          <Input name="cupom" defaultValue={x?.cupom ?? ""} maxLength={60} className="font-mono" />
        </label>
        <label className={rotulo}>
          Vendas
          <Input name="vendas" inputMode="numeric" defaultValue={x?.vendas ?? ""} />
        </label>
        <label className={cn(rotulo, "col-span-2")}>
          Notas
          <textarea name="notas" rows={3} maxLength={2000} defaultValue={x?.notas ?? ""} className={classeTexto} />
        </label>
        <div className="col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar"}
          </Button>
          <Aviso estado={estado.erro ? estado : {}} />
        </div>
        {x?.vendas_origem === "prime" && <p className="col-span-2 m-0 text-[12px] text-ink-faint">As vendas vêm do Prime.</p>}
      </form>
    </PainelLateral>
  );
}

// ---------- notas ----------
export function Notas({ f }: { f: FrenteCompleta }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarNotasFrente, {});
  return (
    <section>
      <Titulo>Notas</Titulo>
      <form action={acao} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={f.id} />
        <textarea name="notas" rows={6} maxLength={20000} defaultValue={f.notas ?? ""} placeholder="Ideias, aprendizados, links soltos…" className={classeTexto} />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar notas"}
          </Button>
          <Aviso estado={estado} />
        </div>
      </form>
    </section>
  );
}
