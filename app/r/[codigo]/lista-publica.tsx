"use client";

// Lista venda a venda do link público (igual à do Lock in): busca, filtros e CSV.
// Só recebe o que o servidor liberou (VendaPublica): primeiro nome + final, nada mais.

import type { VendaPublica } from "@/modulos/vendas/tela";
import { cn } from "@/lib/utils";
import { Check, Copy, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PlataformaTag, StatusTag } from "../../(painel)/vendas/_lockin/base";

const campo =
  "rounded-[10px] border border-line bg-bg-raised-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";
const NOME_STATUS: Record<string, string> = { pago: "Pago", reembolso: "Reembolso", chargeback: "Chargeback" };

function dataHora(v: VendaPublica) {
  if (!v.pagoEm) return `${v.data.slice(8, 10)}/${v.data.slice(5, 7)}/${v.data.slice(0, 4)}`;
  return new Date(v.pagoEm)
    .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .replace(",", "");
}
const curto = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function IdFatura({ id }: { id: string }) {
  const [ok, setOk] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <code className="text-[12px] text-ink-dim" title={id}>
        {curto(id)}
      </code>
      <button
        type="button"
        aria-label={`Copiar ID da fatura ${id}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(id);
            setOk(true);
            setTimeout(() => setOk(false), 1500);
          } catch {}
        }}
        className="rounded p-1 text-ink-faint hover:bg-bg-raised-2 hover:text-white"
      >
        {ok ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  );
}

function TicketCelula({ v }: { v: VendaPublica }) {
  if (v.ticket)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink">
        {v.cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.cor }} aria-hidden />}
        {v.ticket}
        {v.provisorio && <span className="text-[10.5px] text-ink-faint">provisório</span>}
      </span>
    );
  return <span className="text-[12.5px] text-ink-faint">{v.oferta ?? "sem ticket"}</span>;
}

function Lista({ vendas, vazio }: { vendas: VendaPublica[]; vazio: string }) {
  if (!vendas.length) return <p className="m-0 px-2 py-3 text-[13px] italic text-ink-faint">{vazio}</p>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="text-[11.5px] text-ink-dim">
            <tr>
              {["Data e hora", "Cliente", "Ticket", "Plataforma", "Status", "ID da fatura"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendas.map((v) => (
              <tr key={v.idFatura} className="border-t border-line-soft">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-dim">{dataHora(v)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-white">{v.cliente}</td>
                <td className="px-3 py-2">
                  <TicketCelula v={v} />
                </td>
                <td className="px-3 py-2">
                  <PlataformaTag />
                </td>
                <td className="px-3 py-2">
                  <StatusTag status={v.status} />
                </td>
                <td className="px-3 py-2">
                  <IdFatura id={v.idFatura} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 list-none p-0 md:hidden">
        {vendas.map((v) => (
          <li key={v.idFatura} className="flex flex-col gap-1.5 border-t border-line-soft px-2 py-2.5 first:border-t-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[14px] text-white">{v.cliente}</span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-ink-faint">{dataHora(v)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <TicketCelula v={v} />
              <PlataformaTag />
              <StatusTag status={v.status} />
            </div>
            <IdFatura id={v.idFatura} />
          </li>
        ))}
      </ul>
    </>
  );
}

function baixarCsv(nome: string, vendas: VendaPublica[]) {
  const cab = ["Data e hora", "Cliente", "Ticket", "Plataforma", "Status", "ID da fatura", "Comissão"];
  const cel = (x: string) => `"${x.replace(/"/g, '""')}"`;
  const linhas = vendas.map((v) =>
    [dataHora(v), v.cliente, v.ticket ?? v.oferta ?? "sem ticket", "Hubla", NOME_STATUS[v.status] ?? v.status, v.idFatura, v.ticket ? "sim" : v.produto ? "não (produto)" : "não definida"]
      .map(cel)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [cab.map(cel).join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function ListaPublica({ vendas, nomeArquivo }: { vendas: VendaPublica[]; nomeArquivo: string }) {
  const [busca, setBusca] = useState("");
  const [ticket, setTicket] = useState("");
  const [status, setStatus] = useState("");
  const tickets = useMemo(() => [...new Set(vendas.filter((v) => !v.produto).map((v) => v.ticket ?? "sem ticket"))], [vendas]);
  const statusLista = useMemo(() => [...new Set(vendas.map((v) => v.status))], [vendas]);
  const b = semAcento(busca.trim());
  const passa = (v: VendaPublica) => (!b || semAcento(v.cliente).includes(b)) && (!status || v.status === status);
  const comTicket = vendas.filter((v) => !v.produto && passa(v) && (!ticket || (v.ticket ?? "sem ticket") === ticket));
  const produtos = vendas.filter((v) => v.produto && passa(v));

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[180px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou 4 dígitos" aria-label="Buscar por nome ou 4 dígitos" className={cn(campo, "w-full pl-8")} />
        </label>
        <select value={ticket} onChange={(e) => setTicket(e.target.value)} aria-label="Filtrar por ticket" className={campo}>
          <option value="">Todos os tickets</option>
          {tickets.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status" className={campo}>
          <option value="">Todos os status</option>
          {statusLista.map((s) => (
            <option key={s} value={s}>
              {NOME_STATUS[s] ?? s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => baixarCsv(nomeArquivo, vendas)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[12.5px] text-ink-dim transition-colors hover:border-accent hover:text-white"
        >
          <Download size={13} /> Baixar CSV
        </button>
      </div>

      <section className="glass-lite glass-static mb-4 p-2 sm:p-3">
        <div className="flex items-baseline justify-between px-2 pb-2 pt-1">
          <h2 className="text-[15px] font-semibold text-white">Vendas</h2>
          <span className="text-[12px] tabular-nums text-ink-faint">{comTicket.length} na lista</span>
        </div>
        <Lista vendas={comTicket} vazio="Nenhuma venda com esse filtro." />
      </section>

      {vendas.some((v) => v.produto) && (
        <section className="glass-lite glass-static p-2 sm:p-3">
          <div className="px-2 pb-2 pt-1">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold text-white">Sem comissão</h2>
              <span className="text-[12px] tabular-nums text-ink-faint">{produtos.length} na lista</span>
            </div>
            <p className="m-0 mt-0.5 text-[12px] text-ink-dim">O produto principal não é um ticket (combo, protocolo, templates…), então não entra no cálculo da comissão.</p>
          </div>
          <Lista vendas={produtos} vazio="Nenhuma venda com esse filtro." />
        </section>
      )}
    </>
  );
}
