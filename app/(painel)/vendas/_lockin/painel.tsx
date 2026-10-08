"use client";

// Painel do mês, igual ao Lock in do masterview, para um vendedor (ou "Geral" do admin):
// período, Copiar resumo / Importar CSV / Nova venda, 4 cards, margem, rosca, resumo
// por ticket, comissão em cada margem, fechamento e a lista (Pago / Reembolso / Tabela).

import { criarVenda, editarVenda, gravarImportacao, previaImportacao, type VendaInput } from "../acoes-lockin";
import {
  brutoVenda,
  comissaoVenda,
  liquidoVenda,
  resumirLI,
  textoResumo,
  type LinhaImportacao,
  type TicketLI,
  type VendaLI,
} from "@/modulos/vendas/lock-in";
import { FAIXAS, somarMes, type Faixa, type StatusVenda } from "@/modulos/vendas/regras";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check, Copy, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  botaoPrimario,
  botaoSecundario,
  campo,
  dataBR,
  formatBRL,
  Janela,
  PlataformaTag,
  Rosca,
  SemComissaoTag,
  StatusTag,
  TicketTag,
} from "./base";
import { Fechamento } from "./fechamento";

export type VerLista = "pago" | "reembolso" | "tabela";
export type VendedorOpcao = { id: number; nome: string };
export type DadosFechamento = {
  observacoesSalvas: string;
  codigo: string | null;
  whatsapp: string | null;
  adiantamentos: { id: number; valor: number; data: string }[];
  /** fechamento gravado (qtd = todas as pagas) */
  fechado: { faixa: Faixa; quando: string; qtd: number; comissao: number } | null;
};

const cartao = "rounded-2xl border border-line-soft bg-bg-raised-2 p-4";
const titulo = "mb-3 text-[15px] font-semibold text-white";

export function PainelVendas({
  admin,
  vendedor,
  vendedores,
  tickets,
  vendas,
  margemPadrao,
  faixaSugerida,
  mes,
  mesAtual,
  ver,
  hoje,
  base,
  fechamento,
}: {
  admin: boolean;
  /** null = visão Geral (admin) */
  vendedor: VendedorOpcao | null;
  vendedores: VendedorOpcao[];
  tickets: TicketLI[];
  vendas: VendaLI[];
  margemPadrao: Faixa;
  /** % sugerido pela margem do mês (null = faltam valores do mês) */
  faixaSugerida: Faixa | null;
  mes: string;
  mesAtual: string;
  ver: VerLista;
  hoje: string;
  /** "/vendas?v=3" (sem mes/ver) */
  base: string;
  /** dados do fechamento (só com vendedor escolhido) */
  fechamento?: DadosFechamento;
}) {
  const router = useRouter();
  const [margem, setMargem] = useState<Faixa>(margemPadrao);
  const [modal, setModal] = useState<"nova" | "importar" | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [filtro, setFiltro] = useState<FiltroVendas>("todas");

  const resumo = useMemo(() => resumirLI(vendas, tickets), [vendas, tickets]);
  const ticketDe = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const pagas = vendas.filter((v) => v.status === "pago");
  const reembolsos = vendas.filter((v) => v.status === "reembolso");
  const chargebacks = vendas.filter((v) => v.status === "chargeback");
  const naoContam = [...reembolsos, ...chargebacks];
  const vendaAberta = vendas.find((v) => v.id === aberta);
  const mesAnterior = somarMes(mesAtual, -1);
  const url = (m: string, v: VerLista) => `${base}&mes=${m}&ver=${v}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoResumo(resumo, margem));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  const chipPeriodo = (ativo: boolean) =>
    cn("rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors", ativo ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white");

  return (
    <div className="flex flex-col gap-6">
      {/* período + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Período">
          <Link href={url(mesAtual, ver)} className={chipPeriodo(mes === mesAtual)}>
            Mês atual
          </Link>
          <Link href={url(mesAnterior, ver)} className={chipPeriodo(mes === mesAnterior)}>
            Mês anterior
          </Link>
          <input
            type="month"
            value={mes}
            max={mesAtual}
            aria-label="Escolher mês"
            onChange={(e) => e.target.value && router.push(url(e.target.value, ver))}
            className={cn(
              "rounded-full border bg-transparent px-3 py-1 text-[12.5px] text-ink [color-scheme:dark]",
              mes !== mesAtual && mes !== mesAnterior ? "border-accent" : "border-line",
            )}
          />
        </nav>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copiar} className={cn(botaoSecundario, "inline-flex items-center gap-1.5")}>
            {copiado ? <Check size={13} /> : <Copy size={13} />}
            {copiado ? "Copiado" : "Copiar resumo"}
          </button>
          {admin && (
            <>
              <button type="button" onClick={() => setModal("importar")} className={cn(botaoSecundario, "inline-flex items-center gap-1.5")}>
                <Upload size={13} /> Importar CSV
              </button>
              <button
                type="button"
                onClick={() => setModal("nova")}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-background transition-colors hover:bg-white"
              >
                <Plus size={14} /> Nova venda
              </button>
            </>
          )}
        </div>
      </div>

      {/* totais */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { lbl: "total de vendas", num: String(resumo.qtd) },
          { lbl: "faturamento bruto", num: formatBRL(resumo.bruto) },
          { lbl: "valor líquido", num: formatBRL(resumo.liquido) },
          { lbl: `comissão (${margem}%)`, num: formatBRL(resumo.comissao[margem]), destaque: true },
        ].map((c) => (
          <div key={c.lbl} className={cn(cartao, c.destaque && "border-accent/40")}>
            <span className="block text-[22px] font-semibold leading-none tabular-nums text-white sm:text-[24px]">{c.num}</span>
            <span className="mt-1 block text-xs text-ink-dim">{c.lbl}</span>
          </div>
        ))}
      </section>

      {resumo.semTicket > 0 && (
        <p role="status" className="m-0 -mt-3 rounded-xl border border-accent-3/40 bg-accent-3/10 px-3 py-2 text-[12.5px] text-ink">
          ⚠ {resumo.semTicket} venda{resumo.semTicket > 1 ? "s" : ""} a revisar (ticket que não bate com a tabela ou combo não identificado):
          conta{resumo.semTicket > 1 ? "m" : ""} no total de vendas, mas não no bruto, no líquido nem na comissão.
          {admin && " Use o filtro “A revisar” e escolha o ticket em cada uma."}
        </p>
      )}

      {/* margem */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-ink-dim">Margem</span>
        <div role="radiogroup" aria-label="Margem de comissão" className="flex flex-wrap gap-1.5">
          {FAIXAS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={margem === m}
              onClick={() => setMargem(m)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-semibold tabular-nums transition-colors",
                margem === m ? "bg-accent text-background" : "border border-line text-ink-dim hover:border-accent hover:text-white",
              )}
            >
              {m}%
            </button>
          ))}
        </div>
        {!admin && (
          <span className="text-[11.5px] text-ink-faint">
            O % que vale é o do fechamento, escolhido pelo admin ·{" "}
            <span className="text-ink">{faixaSugerida ? `sugerido pela margem do mês: ${faixaSugerida}%` : "margem do mês ainda sem sugestão"}</span>
          </span>
        )}
      </div>

      {/* rosca + resumo por ticket */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="glass-lite glass-static p-4">
          <h3 className={titulo}>Vendas pagas por ticket</h3>
          <Rosca linhas={resumo.porTicket} total={resumo.qtd} semTicket={resumo.semTicket} semTicketProduto={resumo.semTicketProduto} />
        </div>
        <div className="glass-lite glass-static overflow-x-auto p-4">
          <h3 className={titulo}>Resumo por ticket</h3>
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Ticket</th>
                <th className="py-1.5 pr-3 text-right font-medium">Qtd</th>
                <th className="py-1.5 pr-3 text-right font-medium">Bruto</th>
                <th className="py-1.5 pr-3 text-right font-medium">Líquido</th>
                <th className="py-1.5 text-right font-medium">Comissão {margem}%</th>
              </tr>
            </thead>
            <tbody>
              {resumo.porTicket.map((l) => (
                <tr key={l.ticket.id} className="border-t border-line-soft text-ink">
                  <td className="py-1.5 pr-3">
                    <TicketTag ticket={l.ticket} solto />
                  </td>
                  <td className="py-1.5 pr-3 text-right">{l.qtd}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right">{formatBRL(l.bruto)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right">{formatBRL(l.liquido)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right text-white">{formatBRL(l.comissao[margem])}</td>
                </tr>
              ))}
              {resumo.semTicketProduto > 0 && (
                <tr className="border-t border-line-soft text-ink-dim">
                  <td className="py-1.5 pr-3">
                    <SemComissaoTag oferta={null} produto solto />
                  </td>
                  <td className="py-1.5 pr-3 text-right text-ink">{resumo.semTicketProduto}</td>
                  <td className="py-1.5 pr-3 text-right">—</td>
                  <td className="py-1.5 pr-3 text-right">—</td>
                  <td className="py-1.5 text-right">—</td>
                </tr>
              )}
              {resumo.semTicket > 0 && (
                <tr className="border-t border-line-soft text-ink-dim">
                  <td className="py-1.5 pr-3">
                    <SemComissaoTag oferta={null} solto />
                  </td>
                  <td className="py-1.5 pr-3 text-right text-ink">{resumo.semTicket}</td>
                  <td className="py-1.5 pr-3 text-right">—</td>
                  <td className="py-1.5 pr-3 text-right">—</td>
                  <td className="py-1.5 text-right">—</td>
                </tr>
              )}
              {resumo.qtd === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-[13px] italic text-ink-faint">
                    Sem vendas pagas neste período.
                  </td>
                </tr>
              )}
            </tbody>
            {resumo.porTicket.length + (resumo.semTicket > 0 ? 1 : 0) + (resumo.semTicketProduto > 0 ? 1 : 0) > 1 && (
              <tfoot>
                <tr className="border-t border-line text-white">
                  <td className="py-1.5 pr-3 font-medium">Total</td>
                  <td className="py-1.5 pr-3 text-right">{resumo.qtd}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right">{formatBRL(resumo.bruto)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right">{formatBRL(resumo.liquido)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right">{formatBRL(resumo.comissao[margem])}</td>
                </tr>
              </tfoot>
            )}
          </table>

          <h3 className={cn(titulo, "mt-5")}>Comissão em cada margem</h3>
          <div className="grid grid-cols-5 gap-1.5">
            {FAIXAS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMargem(m)}
                className={cn("rounded-xl border px-1.5 py-2 text-center transition-colors", margem === m ? "border-accent bg-accent/15" : "border-line-soft hover:border-accent")}
              >
                <span className="block text-[11.5px] text-ink-dim">{m}%</span>
                <span className="block text-[12.5px] font-medium tabular-nums text-white">{formatBRL(resumo.comissao[m])}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {fechamento && vendedor && (
        <Fechamento
          key={`${mes}-${vendedor.id}`}
          admin={admin}
          mes={mes}
          vendedorId={vendedor.id}
          vendedorNome={vendedor.nome}
          resumo={resumo}
          margem={margem}
          hoje={hoje}
          observacoesSalvas={fechamento.observacoesSalvas}
          codigo={fechamento.codigo}
          whatsapp={fechamento.whatsapp}
          adiantamentos={fechamento.adiantamentos}
          fechadoEm={
            fechamento.fechado
              ? {
                  ...fechamento.fechado,
                  difere: fechamento.fechado.qtd !== resumo.qtd || fechamento.fechado.comissao !== resumo.comissao[fechamento.fechado.faixa],
                }
              : null
          }
        />
      )}

      {/* vendas */}
      <section>
        <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-line-soft pb-3" aria-label="Vendas do período">
          {(
            [
              { id: "pago", nome: `Pago (${pagas.length})` },
              { id: "reembolso", nome: `Reembolso (${reembolsos.length})${chargebacks.length ? ` · Chargeback (${chargebacks.length})` : ""}` },
              { id: "tabela", nome: "Tabela" },
            ] as const
          ).map((a) => (
            <Link
              key={a.id}
              href={url(mes, a.id)}
              scroll={false}
              aria-current={ver === a.id ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors",
                ver === a.id ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
              )}
            >
              {a.nome}
            </Link>
          ))}
        </nav>
        <FiltroChips vendas={vendas} filtro={filtro} onFiltro={setFiltro} />
        {ver === "tabela" ? (
          <TabelaVendas vendas={filtrar(vendas, filtro)} ticketDe={ticketDe} margem={margem} onAbrir={setAberta} mostrarVendedor={!vendedor} vendedores={vendedores} />
        ) : (
          <Grade vendas={filtrar(ver === "pago" ? pagas : naoContam, filtro)} ticketDe={ticketDe} onAbrir={setAberta} vazio={ver} />
        )}
      </section>

      {modal === "nova" && (
        <Janela titulo="Nova venda" onFechar={() => setModal(null)}>
          <VendaForm tickets={tickets} vendedores={vendedores} vendedorInicial={vendedor?.id ?? null} hoje={hoje} onSalvo={() => setModal(null)} />
        </Janela>
      )}
      {modal === "importar" && <ImportarCsv vendedores={vendedores} vendedorInicial={vendedor?.id ?? null} onFechar={() => setModal(null)} />}
      {vendaAberta && (
        <DetalheVenda
          key={vendaAberta.id}
          admin={admin}
          venda={vendaAberta}
          tickets={tickets}
          vendedores={vendedores}
          hoje={hoje}
          margem={margem}
          onFechar={() => setAberta(null)}
        />
      )}
    </div>
  );
}

// ---------- filtros ----------
type FiltroVendas = "todas" | "ticket" | "produto" | "indefinido";
const FILTROS: { id: FiltroVendas; nome: string; teste: (v: VendaLI) => boolean }[] = [
  { id: "todas", nome: "Todas", teste: () => true },
  { id: "ticket", nome: "Com ticket", teste: (v) => v.ticket_id != null },
  { id: "produto", nome: "Sem comissão (produto)", teste: (v) => v.ticket_id == null && v.principal_produto },
  { id: "indefinido", nome: "A revisar", teste: (v) => v.ticket_id == null && !v.principal_produto },
];
const filtrar = (vendas: VendaLI[], f: FiltroVendas) => vendas.filter(FILTROS.find((x) => x.id === f)!.teste);

function FiltroChips({ vendas, filtro, onFiltro }: { vendas: VendaLI[]; filtro: FiltroVendas; onFiltro: (f: FiltroVendas) => void }) {
  if (!vendas.some((v) => v.ticket_id == null)) return null;
  return (
    <div role="radiogroup" aria-label="Filtrar vendas" className="-mt-3 mb-4 flex flex-wrap gap-1.5">
      {FILTROS.map((f) => {
        const n = vendas.filter(f.teste).length;
        if (f.id !== "todas" && n === 0) return null;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filtro === f.id}
            onClick={() => onFiltro(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition-colors",
              filtro === f.id ? "border-accent bg-accent/15 text-white" : "border-line text-ink-dim hover:border-accent hover:text-white",
            )}
          >
            {f.nome} <span className="tabular-nums text-ink-faint">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

const ofertaDe = (v: VendaLI) => v.itens[0] ?? null;

function Grade({ vendas, ticketDe, onAbrir, vazio }: { vendas: VendaLI[]; ticketDe: Map<number, TicketLI>; onAbrir: (id: number) => void; vazio: "pago" | "reembolso" }) {
  if (!vendas.length) {
    return (
      <p className="m-0 py-3 text-[13px] italic text-ink-faint">
        {vazio === "pago" ? "Nenhuma venda paga neste período." : "Nenhum reembolso nem chargeback neste período. 🙌"}
      </p>
    );
  }
  const ordenadas = [...vendas].sort((a, b) => b.data.localeCompare(a.data) || (b.pago_em ?? "").localeCompare(a.pago_em ?? "") || b.id - a.id);
  return (
    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {ordenadas.map((v) => {
        const t = v.ticket_id ? ticketDe.get(v.ticket_id) : undefined;
        return (
          <button key={v.id} type="button" onClick={() => onAbrir(v.id)} className="glass-lite flex min-w-0 flex-col gap-2 px-3 py-2.5 text-left hover:border-accent/50">
            <span className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="truncate text-[14px] font-semibold text-white">{v.cliente}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{dataBR(v.data).slice(0, 5)}</span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              {t ? <TicketTag ticket={t} /> : <SemComissaoTag oferta={ofertaDe(v)} produto={v.principal_produto} />}
              <PlataformaTag />
              <StatusTag status={v.status} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

type Coluna = "data" | "cliente" | "ticket" | "status" | "bruto" | "liquido" | "comissao" | "vendedor";

function TabelaVendas({
  vendas,
  ticketDe,
  margem,
  onAbrir,
  mostrarVendedor,
  vendedores,
}: {
  vendas: VendaLI[];
  ticketDe: Map<number, TicketLI>;
  margem: Faixa;
  onAbrir: (id: number) => void;
  mostrarVendedor: boolean;
  vendedores: VendedorOpcao[];
}) {
  const [ordem, setOrdem] = useState<{ col: Coluna; desc: boolean }>({ col: "data", desc: true });
  const nomeVendedor = (v: VendaLI) => (v.sem_vendedor ? "nenhum" : (vendedores.find((x) => x.id === v.vendedor_id)?.nome ?? "a revisar"));
  const linhas = vendas.map((v) => {
    const t = v.ticket_id ? ticketDe.get(v.ticket_id) : undefined;
    return {
      v,
      t,
      bruto: t ? brutoVenda(v, t) : null,
      liquido: t ? liquidoVenda(v, t) : null,
      comissao: !t ? null : v.status === "pago" ? comissaoVenda(v, t, margem) : 0,
    };
  });
  const valor = (l: (typeof linhas)[number], c: Coluna): string | number =>
    c === "ticket" ? (l.t?.ordem ?? -1) : c === "bruto" || c === "liquido" || c === "comissao" ? (l[c] ?? -1) : c === "vendedor" ? nomeVendedor(l.v) : String(l.v[c]);
  const ordenadas = [...linhas].sort((a, b) => {
    const x = valor(a, ordem.col);
    const y = valor(b, ordem.col);
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
    return ordem.desc ? -r : r;
  });
  const cols: { id: Coluna; nome: string; num?: boolean }[] = [
    { id: "data", nome: "Data" },
    { id: "cliente", nome: "Cliente" },
    ...(mostrarVendedor ? [{ id: "vendedor" as Coluna, nome: "Vendedor" }] : []),
    { id: "ticket", nome: "Ticket" },
    { id: "status", nome: "Status" },
    { id: "bruto", nome: "Bruto", num: true },
    { id: "liquido", nome: "Líquido", num: true },
    { id: "comissao", nome: `Comissão ${margem}%`, num: true },
  ];
  if (!vendas.length) return <p className="m-0 py-3 text-[13px] italic text-ink-faint">Nenhuma venda neste período.</p>;

  return (
    <div className="rolagem-fina overflow-x-auto rounded-2xl border border-line-soft">
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <thead className="text-[11.5px] text-ink-dim">
          <tr>
            {cols.map((c) => (
              <th key={c.id} aria-sort={ordem.col === c.id ? (ordem.desc ? "descending" : "ascending") : undefined} className={cn("whitespace-nowrap px-3 py-2 font-medium", c.num && "text-right")}>
                <button
                  type="button"
                  onClick={() => setOrdem((o) => ({ col: c.id, desc: o.col === c.id ? !o.desc : c.id === "data" || !!c.num }))}
                  className={cn("inline-flex items-center gap-1 hover:text-white", ordem.col === c.id && "text-white")}
                >
                  {c.nome}
                  {ordem.col === c.id && (ordem.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(({ v, t, bruto, liquido, comissao }) => (
            <tr key={v.id} onClick={() => onAbrir(v.id)} className={cn("cursor-pointer border-t border-line-soft hover:bg-bg-raised-2", v.status !== "pago" ? "text-ink-faint" : "text-ink")}>
              <td className="whitespace-nowrap px-3 py-2">{dataBR(v.data)}</td>
              <td className="whitespace-nowrap px-3 py-2">{v.cliente}</td>
              {mostrarVendedor && <td className="whitespace-nowrap px-3 py-2">{nomeVendedor(v)}</td>}
              <td className="px-3 py-2">{t ? <TicketTag ticket={t} solto /> : <SemComissaoTag oferta={ofertaDe(v)} produto={v.principal_produto} solto />}</td>
              <td className="px-3 py-2">
                <StatusTag status={v.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{bruto == null ? "—" : formatBRL(bruto)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{liquido == null ? "—" : formatBRL(liquido)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{comissao == null ? "—" : formatBRL(comissao)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- detalhe da venda ----------
function DetalheVenda({
  admin,
  venda: v,
  tickets,
  vendedores,
  hoje,
  margem,
  onFechar,
}: {
  admin: boolean;
  venda: VendaLI;
  tickets: TicketLI[];
  vendedores: VendedorOpcao[];
  hoje: string;
  margem: Faixa;
  onFechar: () => void;
}) {
  const t = v.ticket_id ? tickets.find((x) => x.id === v.ticket_id) : undefined;
  return (
    <Janela titulo={v.cliente} onFechar={onFechar}>
      <div className="-mt-2 mb-3 flex flex-wrap gap-1.5">
        <PlataformaTag />
        <StatusTag status={v.status} />
        <span className="text-[12px] text-ink-faint">{dataBR(v.data)}</span>
      </div>
      {!t &&
        (v.principal_produto ? (
          <p className="-mt-1 mb-4 text-[12.5px] text-ink-dim">
            Sem comissão (produto){ofertaDe(v) ? `: ${ofertaDe(v)}` : ""}. O produto principal não é ticket, então não gera comissão.
          </p>
        ) : (
          <p className="-mt-1 mb-4 text-[12.5px] text-accent-3">
            A revisar{v.motivo_sem_ticket ? ` (${v.motivo_sem_ticket})` : ""}. Conta no total de vendas{admin ? "; escolha o ticket abaixo pra entrar na comissão" : ""}.
          </p>
        ))}
      {v.bumps.length > 0 && (
        <p className="-mt-2 mb-4 text-[12px] text-ink-faint">
          Order bump: {v.bumps.join(", ")} <span>(não entra em bruto, líquido nem comissão)</span>
        </p>
      )}
      {t && (
        <div className="-mt-1 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] tabular-nums text-ink-dim">
          <TicketTag ticket={t} />
          <span>bruto {formatBRL(brutoVenda(v, t) ?? 0)}</span>
          <span>líquido {formatBRL(liquidoVenda(v, t) ?? 0)}</span>
          <span className={v.status === "pago" ? "text-white" : "line-through"}>
            comissão {margem}% {formatBRL(comissaoVenda(v, t, margem) ?? 0)}
          </span>
        </div>
      )}
      <p className="mb-4 text-[11.5px] text-ink-faint">Fatura {v.id_fatura}</p>
      {admin && <VendaForm tickets={tickets} vendedores={vendedores} venda={v} vendedorInicial={v.vendedor_id} hoje={hoje} onSalvo={onFechar} />}
    </Janela>
  );
}

// ---------- formulário de venda (nova ou edição, só admin) ----------
function Botoes<T extends string | number>({
  opcoes,
  valor,
  onEscolher,
  rotulo,
  render,
}: {
  opcoes: readonly T[];
  valor: T | null;
  onEscolher: (v: T) => void;
  rotulo: string;
  render?: (v: T) => ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={valor === o}
          onClick={() => onEscolher(o)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
            valor === o ? "border-accent bg-accent/15 text-white" : "border-line text-ink-dim hover:border-accent hover:text-white",
          )}
        >
          {render ? render(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

const STATUS: StatusVenda[] = ["pago", "reembolso", "chargeback"];
const NOME_STATUS: Record<StatusVenda, string> = { pago: "Pago", reembolso: "Reembolso", chargeback: "Chargeback" };

function VendaForm({
  tickets,
  vendedores,
  venda,
  vendedorInicial,
  hoje,
  onSalvo,
}: {
  tickets: TicketLI[];
  vendedores: VendedorOpcao[];
  venda?: VendaLI;
  vendedorInicial: number | null;
  hoje: string;
  onSalvo: () => void;
}) {
  const nova = !venda;
  const opcoesTicket = tickets.filter((t) => t.ativo || t.id === venda?.ticket_id || !nova);
  const separado = venda?.cliente.match(/^(.*?)\s*-\s*(\d{4})$/);
  const [nome, setNome] = useState(separado ? separado[1] : (venda?.cliente ?? ""));
  const [digitos, setDigitos] = useState(separado ? separado[2] : (venda?.final_lead ?? ""));
  // "produto" = sem comissão (produto); "revisar" = sem ticket definido
  const [ticket, setTicket] = useState<number | "produto" | "revisar">(
    venda ? (venda.ticket_id ?? (venda.principal_produto ? "produto" : "revisar")) : (tickets.find((t) => t.ativo)?.id ?? "revisar"),
  );
  const [status, setStatus] = useState<StatusVenda>(venda?.status ?? "pago");
  const [data, setData] = useState(venda?.data ?? hoje);
  const [dono, setDono] = useState<number | "nenhum" | null>(venda?.sem_vendedor ? "nenhum" : vendedorInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (digitos && !/^\d{4}$/.test(digitos)) return setErro("Os dígitos do telefone são 4 números.");
    const input: VendaInput = {
      vendedorId: typeof dono === "number" ? dono : null,
      nome,
      digitos,
      ticketId: typeof ticket === "number" ? ticket : null,
      principalProduto: ticket === "produto",
      status,
      data,
    };
    startTransition(async () => {
      const r = venda ? await editarVenda(venda.id, { ...input, semVendedor: dono === "nenhum" }) : await criarVenda(input);
      if (r.erro) setErro(r.erro);
      else onSalvo();
    });
  }

  const opcoes: (number | "produto" | "revisar")[] = [...opcoesTicket.map((t) => t.id), "produto", "revisar"];
  return (
    <form onSubmit={enviar} className="flex flex-col gap-3.5">
      <div className="grid grid-cols-[1fr_96px] gap-2.5">
        <label className="text-xs text-ink-dim">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={nova} autoComplete="off" required maxLength={60} placeholder="Lucas" className={`${campo} mt-1`} />
        </label>
        <label className="text-xs text-ink-dim">
          4 dígitos
          <input
            value={digitos}
            onChange={(e) => setDigitos(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="1389"
            className={`${campo} mt-1 tabular-nums`}
          />
        </label>
      </div>

      <div className="text-xs text-ink-dim">
        <div className="mb-1.5">Vendedor</div>
        <Botoes
          opcoes={[...vendedores.map((v) => v.id), ...(nova ? [] : (["nenhum"] as const))] as (number | "nenhum")[]}
          valor={dono}
          onEscolher={setDono}
          rotulo="Vendedor"
          render={(id) => (id === "nenhum" ? "não é de vendedor" : (vendedores.find((v) => v.id === id)?.nome ?? String(id)))}
        />
      </div>

      <div className="text-xs text-ink-dim">
        <div className="mb-1.5">Ticket</div>
        <Botoes
          opcoes={opcoes}
          valor={ticket}
          onEscolher={setTicket}
          rotulo="Ticket"
          render={(o) =>
            o === "produto" ? "sem comissão (produto)" : o === "revisar" ? "a revisar" : <TicketTag ticket={tickets.find((t) => t.id === o)!} solto />
          }
        />
      </div>

      {!nova && (
        <div className="text-xs text-ink-dim">
          <div className="mb-1.5">Status</div>
          <Botoes opcoes={STATUS} valor={status} onEscolher={setStatus} rotulo="Status" render={(s) => NOME_STATUS[s]} />
        </div>
      )}

      <label className="text-xs text-ink-dim">
        Data
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} required className={`${campo} mt-1 [color-scheme:dark]`} />
      </label>

      {erro && (
        <p role="alert" className="m-0 text-xs text-accent-3">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={botaoPrimario}>
          {pending ? "Salvando…" : nova ? "Salvar venda" : "Salvar"}
        </button>
        {nova && <span className="text-[11.5px] text-ink-faint">Enter salva</span>}
      </div>
    </form>
  );
}

// ---------- importar CSV ----------
function ImportarCsv({ vendedores, vendedorInicial, onFechar }: { vendedores: VendedorOpcao[]; vendedorInicial: number | null; onFechar: () => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaImportacao[] | null>(null);
  const [vendedor, setVendedor] = useState<number | null>(vendedorInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const boas = linhas?.filter((l) => !l.problemas.length) ?? [];
  const comProblema = linhas?.filter((l) => l.problemas.length) ?? [];

  async function escolher(arquivo: File | undefined) {
    setErro(null);
    setLinhas(null);
    setFeito(null);
    if (!arquivo) return;
    const t = await arquivo.text();
    setTexto(t);
    startTransition(async () => {
      const r = await previaImportacao(t);
      if ("erro" in r) setErro(r.erro);
      else setLinhas(r.linhas);
    });
  }

  return (
    <Janela titulo="Importar CSV" onFechar={onFechar} largura="max-w-3xl">
      {feito != null ? (
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-[14px] text-white">
            {feito} venda{feito === 1 ? "" : "s"} importada{feito === 1 ? "" : "s"}. ✓
          </p>
          <button type="button" onClick={onFechar} className={botaoPrimario}>
            Fechar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[13px] text-ink-dim">
            CSV com as colunas Nome (“Lucas -1389”), Categoria (ticket), Status e Date, como o export do Notion do Lock in. O histórico da Hubla
            entra pela planilha da Hubla (script), não por aqui.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-dim">
            Vendedor:
            {vendedores.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVendedor(v.id)}
                className={cn("rounded-full border px-3 py-1 text-[12.5px]", vendedor === v.id ? "border-accent bg-accent/15 text-white" : "border-line text-ink-dim")}
              >
                {v.nome}
              </button>
            ))}
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Arquivo CSV"
            onChange={(e) => escolher(e.target.files?.[0])}
            className="text-[13px] text-ink-dim file:mr-3 file:rounded-full file:border file:border-line file:bg-transparent file:px-3.5 file:py-1.5 file:text-[12.5px] file:text-ink hover:file:border-accent"
          />
          {pending && !linhas && <p className="m-0 text-[13px] text-ink-faint">Lendo…</p>}
          {erro && (
            <p role="alert" className="m-0 text-[13px] text-accent-3">
              {erro}
            </p>
          )}
          {linhas && (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                <span className="text-white">{boas.length} pra importar</span>
                <span className={comProblema.length ? "text-accent-3" : "text-ink-dim"}>{comProblema.length} com problema (puladas)</span>
              </div>
              <div className="max-h-[45vh] overflow-auto rounded-xl border border-line-soft">
                <table className="w-full border-collapse text-left text-[12.5px]">
                  <thead className="sticky top-0 bg-background/90 text-ink-dim backdrop-blur">
                    <tr>
                      {["#", "Cliente", "Ticket", "Status", "Data", ""].map((h) => (
                        <th key={h} className="whitespace-nowrap px-2.5 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.linha} className={cn("border-t border-line-soft", l.problemas.length ? "text-accent-3" : "text-ink")}>
                        <td className="px-2.5 py-1.5 tabular-nums text-ink-faint">{l.linha}</td>
                        <td className="px-2.5 py-1.5">{l.nome ? `${l.nome}${l.digitos ? ` -${l.digitos}` : ""}` : "—"}</td>
                        <td className="px-2.5 py-1.5">{l.ticketNome ?? (l.categoria || "—")}</td>
                        <td className="px-2.5 py-1.5">{l.status ?? "—"}</td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{l.data ? dataBR(l.data) : "—"}</td>
                        <td className="px-2.5 py-1.5 text-[11.5px]">{l.problemas.length ? l.problemas.join("; ") : "ok"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    texto &&
                    vendedor &&
                    startTransition(async () => {
                      const r = await gravarImportacao(texto, vendedor);
                      if (r.erro) setErro(r.erro);
                      else setFeito(r.gravadas ?? 0);
                    })
                  }
                  disabled={pending || !boas.length || !vendedor}
                  className={botaoPrimario}
                >
                  {pending ? "Gravando…" : `Gravar ${boas.length} venda${boas.length === 1 ? "" : "s"}`}
                </button>
                <button type="button" onClick={onFechar} disabled={pending} className={botaoSecundario}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Janela>
  );
}
