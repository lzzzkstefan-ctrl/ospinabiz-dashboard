"use client";

// Peças visuais da tela de Vendas, copiadas do Lock in do masterview (só o visual):
// janela, botão de confirmação, etiquetas de ticket/status/plataforma e a rosca.

import { Etiqueta, type CorEtiqueta } from "@/components/ui/etiqueta";
import type { LinhaTicket, TicketLI } from "@/modulos/vendas/lock-in";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useState, useTransition, type ReactNode } from "react";

export const campo =
  "w-full rounded-[10px] border border-line bg-bg-raised-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";
export const botaoPrimario =
  "rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-background transition-colors hover:bg-white disabled:opacity-60";
export const botaoSecundario =
  "rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:border-accent hover:text-white disabled:opacity-60";

/** "1.234,56" ou "500" → centavos; inválido → null */
export function parseValorBR(s: string): number | null {
  const t = s.trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** 123456 → "R$ 1.234,56" */
export const formatBRL = (c: number) =>
  `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "2026-07-03" → "03/07/2026" */
export const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Modal de vidro: fecha no X, no Esc e clicando fora. */
export function Janela({
  titulo,
  onFechar,
  children,
  largura = "max-w-lg",
}: {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn("glass max-h-[90vh] w-full overflow-y-auto p-5 sm:p-6", largura)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-semibold text-white">{titulo}</h3>
          <button type="button" aria-label="fechar" onClick={onFechar} className="text-ink-faint hover:text-white">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Botão em 2 passos: o 1º clique só pergunta, a ação só roda no "Sim". */
export function ConfirmButton({
  label,
  pergunta,
  action,
  className,
}: {
  label: ReactNode;
  pergunta: string;
  action: () => Promise<{ erro?: string }>;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={className}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-accent/40 bg-bg-raised-2 px-2.5 py-1.5">
      <span className="text-xs text-ink">{pergunta}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await action();
            if (r.erro) setErro(r.erro);
            else setAberto(false);
          })
        }
        className={cn("rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-background hover:bg-white", pending && "opacity-60")}
      >
        {pending ? "…" : "Sim"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setAberto(false);
          setErro(null);
        }}
        className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-white"
      >
        Cancelar
      </button>
      {erro && (
        <span role="alert" className="w-full text-xs text-accent-3">
          {erro}
        </span>
      )}
    </span>
  );
}

/** Etiqueta do ticket: bolinha na cor do ticket + nome em texto neutro. */
export function TicketTag({ ticket, solto }: { ticket: TicketLI; solto?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink", !solto && "rounded-full border px-2 py-0.5")}
      style={solto ? undefined : { borderColor: `${ticket.cor}80`, background: `${ticket.cor}1f` }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ticket.cor }} aria-hidden />
      {ticket.nome}
      {ticket.provisorio && <span className="text-[10.5px] text-ink-faint">provisório</span>}
    </span>
  );
}

/** Venda sem ticket: "sem comissão (produto)" ou "a revisar", com a oferta. */
export function SemComissaoTag({ oferta, solto, produto }: { oferta: string | null; solto?: boolean; produto?: boolean }) {
  return (
    <span
      title={oferta ?? undefined}
      className={cn(
        "inline-flex max-w-[16rem] items-center gap-1.5 truncate whitespace-nowrap text-[12px] text-ink-dim",
        !solto && "rounded-full border border-dashed border-line px-2 py-0.5",
      )}
    >
      {produto ? "sem comissão (produto)" : "a revisar"}
      {oferta ? ` · ${oferta}` : ""}
    </span>
  );
}

const COR_STATUS: Record<string, CorEtiqueta> = { pago: "azul", reembolso: "laranja", chargeback: "vermelho" };
const NOME_STATUS: Record<string, string> = { pago: "Pago", reembolso: "Reembolso", chargeback: "Chargeback" };

export function StatusTag({ status }: { status: string }) {
  return <Etiqueta cor={COR_STATUS[status] ?? "cinza"}>{NOME_STATUS[status] ?? status}</Etiqueta>;
}

/** Todas as vendas daqui vêm da Hubla (webhook ou planilha). */
export function PlataformaTag() {
  return <Etiqueta cor="verde">Hubla</Etiqueta>;
}

// ---------- rosca ----------
const R = 52;
const ESPESSURA = 16;
const C = 2 * Math.PI * R;
const RESPIRO = 2;
const PRODUTO = { id: "sem-ticket-produto", nome: "sem comissão (produto)", cor: "#6b7280" };
const SEM_TICKET = { id: "sem-ticket", nome: "sem comissão definida", cor: "#a3a3a3" };

/** Rosca das vendas pagas por ticket. Centro: total pago, ou o ticket sob o mouse. */
export function Rosca({
  linhas: porTicket,
  total,
  semTicket = 0,
  semTicketProduto = 0,
}: {
  linhas: LinhaTicket[];
  total: number;
  semTicket?: number;
  semTicketProduto?: number;
}) {
  const [foco, setFoco] = useState<string | null>(null);
  const linhas = [
    ...porTicket.map((l) => ({ ticket: { id: String(l.ticket.id), nome: l.ticket.nome, cor: l.ticket.cor }, qtd: l.qtd })),
    ...(semTicketProduto ? [{ ticket: PRODUTO, qtd: semTicketProduto }] : []),
    ...(semTicket ? [{ ticket: SEM_TICKET, qtd: semTicket }] : []),
  ];
  const focada = linhas.find((l) => l.ticket.id === foco);
  if (total === 0) return <p className="m-0 py-6 text-center text-[13px] italic text-ink-faint">Nenhuma venda paga neste período.</p>;

  let acumulado = 0;
  const fatias = linhas.map((l) => {
    const tam = (l.qtd / total) * C;
    const inicio = acumulado;
    acumulado += tam;
    return { l, inicio, tam: linhas.length > 1 ? Math.max(tam - RESPIRO, 0.5) : tam };
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="Vendas pagas por ticket">
          {fatias.map(({ l, inicio, tam }) => (
            <circle
              key={l.ticket.id}
              cx={70}
              cy={70}
              r={R}
              fill="none"
              stroke={l.ticket.cor}
              strokeWidth={ESPESSURA}
              strokeDasharray={`${tam} ${C - tam}`}
              strokeDashoffset={-inicio}
              opacity={foco === null || foco === l.ticket.id ? 1 : 0.3}
              className="cursor-default transition-opacity duration-200"
              onMouseEnter={() => setFoco(l.ticket.id)}
              onMouseLeave={() => setFoco(null)}
            >
              <title>{`${l.ticket.nome}: ${l.qtd} venda${l.qtd > 1 ? "s" : ""} (${Math.round((l.qtd / total) * 100)}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-semibold leading-none tabular-nums text-white">{focada ? focada.qtd : total}</span>
          <span className="mt-1 text-[11px] text-ink-dim">{focada ? focada.ticket.nome : "vendas pagas"}</span>
        </div>
      </div>
      <ul className="m-0 flex w-full list-none flex-col gap-1.5 p-0 text-[13px]">
        {linhas.map((l) => (
          <li
            key={l.ticket.id}
            className="flex items-center gap-2 rounded-lg px-1.5 py-0.5"
            onMouseEnter={() => setFoco(l.ticket.id)}
            onMouseLeave={() => setFoco(null)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.ticket.cor }} aria-hidden />
            <span className="text-ink-dim">{l.ticket.nome}</span>
            <span className="ml-auto tabular-nums text-white">{l.qtd}</span>
            <span className="w-9 text-right tabular-nums text-ink-faint">{Math.round((l.qtd / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
