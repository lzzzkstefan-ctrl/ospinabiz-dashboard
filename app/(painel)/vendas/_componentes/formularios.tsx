"use client";

import { Aviso, Campo, classeOpcao, classeSelect, Gaveta, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { atribuirVenda, corrigirVenda, criarCusto, fecharMes, salvarMes, salvarMeta, salvarTicket, valorDoCusto } from "../acoes";

// Formulários da aba Vendas (os que mostram mensagem de resultado ou precisam do navegador).

function Salvar({ texto = "Salvar" }: { texto?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando..." : texto}
    </Button>
  );
}

/** Copia o texto "PRESTAÇÃO COMERCIAL GCS" para a área de transferência. */
export function CopiarResumo({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? "Copiado!" : "Copiar resumo"}
    </Button>
  );
}

/** Admin: fecha o mês de um vendedor no % escolhido (a faixa sugerida vem marcada). */
export function FecharMes({
  mes,
  vendedorId,
  faixaAtual,
  faixaSugerida,
}: {
  mes: string;
  vendedorId: number;
  faixaAtual: number | null;
  faixaSugerida: number | null;
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(fecharMes, {});
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="vendedor_id" value={vendedorId} />
      <select name="faixa" defaultValue={faixaAtual ?? faixaSugerida ?? 6} className={`${classeSelect} h-9 w-auto`} aria-label="Margem de comissão">
        {[6, 7, 8, 9, 10].map((f) => (
          <option key={f} value={f} className={classeOpcao}>
            {f}%{f === faixaSugerida ? " (sugerida pela margem)" : ""}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-ink-dim">
        <input type="checkbox" name="confirmar_mes_aberto" value="sim" /> fechar mesmo se o mês ainda não acabou
      </label>
      <Salvar texto={faixaAtual ? "Atualizar fechamento" : "Fechar mês"} />
      <Aviso estado={estado} />
    </form>
  );
}

/** Abre a janela de impressão do navegador (dali sai o PDF). */
export function BotaoImprimir() {
  return (
    <Button type="button" onClick={() => window.print()}>
      Imprimir / salvar PDF
    </Button>
  );
}

/** Admin: trocar o dono da venda. */
export function AtribuirVenda({
  vendaId,
  atual,
  vendedores,
}: {
  vendaId: number;
  atual: string;
  vendedores: { equipe_id: number; nome: string }[];
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(atribuirVenda, {});
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={vendaId} />
      <select name="destino" defaultValue={atual} className={`${classeSelect} h-8 w-auto`}>
        <option value="a_atribuir" className={classeOpcao}>A atribuir</option>
        {vendedores.map((v) => (
          <option key={v.equipe_id} value={v.equipe_id} className={classeOpcao}>{v.nome}</option>
        ))}
        <option value="ninguem" className={classeOpcao}>Não é de vendedor</option>
      </select>
      <Salvar texto="Atribuir" />
      <Aviso estado={estado} />
    </form>
  );
}

/** Admin: corrigir ticket e status da venda. */
export function CorrigirVenda({
  vendaId,
  ticketId,
  status,
  tickets,
}: {
  vendaId: number;
  ticketId: number | null;
  status: string;
  tickets: { id: number; rotulo: string }[];
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(corrigirVenda, {});
  return (
    <Gaveta rotulo="Corrigir">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={vendaId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Ticket">
            <select name="ticket_id" defaultValue={ticketId ?? ""} className={classeSelect}>
              <option value="" className={classeOpcao}>Sem ticket</option>
              {tickets.map((t) => (
                <option key={t.id} value={t.id} className={classeOpcao}>{t.rotulo}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Status">
            <select name="status" defaultValue={status} className={classeSelect}>
              <option value="pago" className={classeOpcao}>Pago</option>
              <option value="reembolso" className={classeOpcao}>Reembolso</option>
              <option value="chargeback" className={classeOpcao}>Chargeback</option>
            </select>
          </Campo>
        </div>
        <div className="flex items-center gap-3">
          <Salvar />
          <Aviso estado={estado} />
        </div>
      </form>
    </Gaveta>
  );
}

const reaisTexto = (v: number | null) => (v === null ? "" : (v / 100).toFixed(2).replace(".", ","));

/** Admin: valores do mês que entram na margem. Valores em centavos. */
/** Meta do mês: quantidade de vendas da equipe (só o chefe; o RLS confere de novo). */
export function FormMeta({ mes, meta }: { mes: string; meta: number | null }) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(salvarMeta, {});
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="mes" value={mes} />
      <Campo rotulo="Meta (vendas)">
        <Input name="meta_qtd" inputMode="numeric" defaultValue={meta ?? ""} placeholder="ex.: 200" className="w-36 tabular-nums" />
      </Campo>
      <Salvar />
      <Aviso estado={estado} />
    </form>
  );
}

export function FormMes({
  mes,
  gasto,
  imposto,
  mensagens,
}: {
  mes: string;
  gasto: number | null;
  imposto: number | null;
  mensagens: number | null;
}) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(salvarMes, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="mes" value={mes} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Gasto em anúncios (R$)">
          <Input name="gasto_anuncios" inputMode="decimal" defaultValue={reaisTexto(gasto)} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Imposto Meta (R$)">
          <Input name="imposto_meta" inputMode="decimal" defaultValue={reaisTexto(imposto)} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Custo de mensagens (R$)">
          <Input name="custo_mensagens" inputMode="decimal" defaultValue={reaisTexto(mensagens)} placeholder="0,00" />
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Salvar />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

const CAMPOS_TICKET = [
  ["valor_bruto", "Bruto"],
  ["valor_liquido", "Líquido"],
  ["comissao_6", "6%"],
  ["comissao_7", "7%"],
  ["comissao_8", "8%"],
  ["comissao_9", "9%"],
  ["comissao_10", "10%"],
] as const;

/** Admin: criar ou editar ticket. `ticket` com valores em reais. */
export function FormTicket({ ticket }: { ticket?: { id: number } & Record<(typeof CAMPOS_TICKET)[number][0], number> }) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(salvarTicket, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      {ticket && <input type="hidden" name="id" value={ticket.id} />}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
        {CAMPOS_TICKET.map(([campo, rotulo]) => (
          <Campo key={campo} rotulo={rotulo}>
            <Input
              name={campo}
              inputMode="decimal"
              required
              defaultValue={ticket ? ticket[campo].toFixed(2).replace(".", ",") : ""}
              placeholder="0,00"
            />
          </Campo>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Salvar texto={ticket ? "Salvar" : "Cadastrar ticket"} />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormNovoCusto({ mes }: { mes: string }) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(criarCusto, {});
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="mes" value={mes} />
      <Campo rotulo="Novo custo">
        <Input name="nome" maxLength={60} required placeholder="ex.: Ferramenta X" />
      </Campo>
      <Campo rotulo="Valor mensal (R$)">
        <Input name="valor" inputMode="decimal" placeholder="vazio = sem valor" />
      </Campo>
      <Salvar texto="Adicionar" />
      <Aviso estado={estado} />
    </form>
  );
}

/** Valor de um custo a partir do mês mostrado na tela. Valor em centavos. */
export function FormValorCusto({ custoId, mes, valor }: { custoId: number; mes: string; valor: number | null }) {
  const [estado, acao] = useActionState<EstadoForm, FormData>(valorDoCusto, {});
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={custoId} />
      <input type="hidden" name="mes" value={mes} />
      <Input name="valor" inputMode="decimal" defaultValue={reaisTexto(valor)} placeholder="sem valor" className="h-8 w-28" />
      <Salvar />
      <Aviso estado={estado} />
    </form>
  );
}
