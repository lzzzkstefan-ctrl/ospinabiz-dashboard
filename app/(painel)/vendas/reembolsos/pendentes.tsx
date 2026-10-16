"use client";

import { Button } from "@/components/ui/button";
import { Etiqueta } from "@/components/ui/etiqueta";
import { cn } from "@/lib/utils";
import { dataCurta, falta, nomeDaLinha, type Reembolso } from "@/modulos/vendas/reembolsos-regras";
import { useEffect, useState, useTransition } from "react";
import { marcarRevertido } from "../acoes";

// Peças da tela Reembolsos que precisam do navegador: contagem regressiva, copiar o ID,
// WhatsApp e o botão "Marcar como revertido".

const HORA = 3_600_000;

/** Relógio que anda sozinho (a cada 30 s) para a contagem regressiva. */
function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

/** Só os 4 últimos dígitos na tela; o número inteiro vai só no link do WhatsApp. */
const telefoneMascarado = (t: string | null) => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `•••• ${d.slice(-4)}` : "sem telefone";
};

/** wa.me exige DDI: número brasileiro sem o 55 ganha o 55. */
function linkWhatsapp(t: string | null): string | null {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

const brl = (v: number | string | null) =>
  v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Contagem({ prazo, agora }: { prazo: string | null; agora: number }) {
  if (!prazo) return <span className="text-[13px] text-ink-dim">sem prazo automático</span>;
  const ms = new Date(prazo).getTime() - agora;
  const cor = ms <= 0 ? "text-red-400" : ms < 24 * HORA ? "text-red-400" : ms < 48 * HORA ? "text-amber-300" : "text-white";
  return (
    <span className="flex flex-col items-start leading-tight sm:items-end">
      <span className={cn("text-[20px] font-semibold tabular-nums", cor)}>{ms <= 0 ? "prazo vencido" : `faltam ${falta(ms)}`}</span>
      <span className="text-[12px] text-ink-dim">prazo {dataCurta(prazo)}</span>
    </span>
  );
}

function CopiarId({ id }: { id: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(id);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? "Copiado!" : "Copiar ID do pedido"}
    </Button>
  );
}

function Reverter({ id, nome }: { id: number; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={pendente}
        onClick={() => {
          if (!confirm(`Marcar o reembolso de ${nome} como revertido? Fica registrado quem marcou e quando.`)) return;
          setErro(null);
          iniciar(async () => {
            const r = await marcarRevertido(id);
            if (r.erro) setErro(r.erro);
          });
        }}
      >
        {pendente ? "Salvando..." : "Marcar como revertido"}
      </Button>
      {erro && <span className="text-[12.5px] text-red-400">{erro}</span>}
    </>
  );
}

export function ListaPendentes({ pedidos, vendedores, destaque }: { pedidos: Reembolso[]; vendedores: Record<number, string>; destaque: number | null }) {
  const agora = useAgora();
  useEffect(() => {
    if (destaque) document.getElementById(`r-${destaque}`)?.scrollIntoView({ block: "center" });
  }, [destaque]);

  if (pedidos.length === 0) return <p className="text-[13.5px] text-ink-dim">Nenhum pedido de reembolso pendente.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {pedidos.map((r) => {
        const wa = linkWhatsapp(r.cliente_telefone);
        const nome = r.cliente_nome ?? "Cliente";
        return (
          <li
            key={r.id}
            id={`r-${r.id}`}
            className={cn("glass-lite glass-static flex flex-col gap-3 p-4", destaque === r.id && "ring-2 ring-accent")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[16px] font-semibold text-white">{nome}</span>
                <span className="flex flex-wrap items-center gap-2 text-[13.5px] tabular-nums">
                  <span className="text-white">{brl(r.valor)}</span>
                  <Etiqueta cor={r.linha === "viral" ? "roxo" : "azul"}>{nomeDaLinha(r.linha)}</Etiqueta>
                  <span className="text-ink-dim">{r.vendedor_id ? (vendedores[r.vendedor_id] ?? "vendedor") : "sem vendedor"}</span>
                </span>
              </div>
              <Contagem prazo={r.prazo} agora={agora} />
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px] text-ink-dim sm:grid-cols-[auto_1fr_auto_1fr]">
              <dt>Pedido em</dt>
              <dd className="text-ink">{dataCurta(r.pedido_em)}</dd>
              <dt>Pago em</dt>
              <dd className="text-ink">{r.pago_em ? dataCurta(r.pago_em) : "—"}</dd>
              <dt>Telefone</dt>
              <dd className="text-ink tabular-nums">{telefoneMascarado(r.cliente_telefone)}</dd>
              <dt>Produto</dt>
              <dd className="text-ink">{r.produto ?? "—"}</dd>
              {r.auto_aceite !== null && (
                <>
                  <dt>Aceite automático</dt>
                  <dd className="text-ink">{r.auto_aceite ? "sim" : "não"}</dd>
                </>
              )}
            </dl>
            {r.motivo && <p className="text-[12.5px] text-ink-dim">Motivo do cliente: &ldquo;{r.motivo}&rdquo;</p>}

            <div className="flex flex-wrap items-center gap-2">
              {wa ? (
                <Button asChild size="sm" variant="secondary">
                  <a href={wa} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </Button>
              ) : (
                <span className="text-[12.5px] text-ink-faint">sem WhatsApp</span>
              )}
              <CopiarId id={r.id_fatura} />
              <Reverter id={r.id} nome={nome} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
