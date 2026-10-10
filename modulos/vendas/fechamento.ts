// Fechamento do mês por vendedor: totais congelados, CSV e linhas do relatório (PDF).
// Roda no servidor com a chave secreta: quem chama confere antes se é admin.
// O % (faixa) é escolhido pelo admin; a faixa da margem da operação é só sugestão.

import { createAdminClient } from "@/lib/supabase/admin";
import { COLUNAS_VENDA, margemDoMes } from "./dados";
import { centavos, intervaloMes, precoCurto, resumir, type Faixa, type Resumo, type Ticket, type Venda } from "./regras";

export type LinhaRelatorio = {
  data: string; // dd/mm/aaaa
  hora: string; // hh:mm ou ""
  cliente: string; // "Primeiro nome -1234"
  ticket: string; // "R$338" ou "sem ticket"
  status: string;
  bruto: number | null; // centavos; null = não conta (sem ticket, reembolso, chargeback)
  liquido: number | null;
  comissao: number | null;
};

export type DadosFechamento = {
  vendas: Venda[];
  tickets: Ticket[];
  resumo: Resumo;
  faixaSugerida: Faixa | null;
  clientes: Map<number, string>;
};

/** Vendas do vendedor no mês, totais e a faixa sugerida pela margem da operação. */
export async function dadosDoFechamento(mes: string, vendedorId: number): Promise<DadosFechamento> {
  const db = createAdminClient();
  const { inicio, fim } = intervaloMes(mes);
  const [vendasQ, ticketsQ, margem] = await Promise.all([
    db
      .from("vendas")
      .select(COLUNAS_VENDA)
      .eq("vendedor_id", vendedorId)
      .eq("aguardando_confirmacao", false)
      .gte("data", inicio)
      .lt("data", fim)
      .order("data")
      .order("pago_em")
      .returns<Venda[]>(),
    db.from("tickets").select("*").returns<Ticket[]>(),
    margemDoMes(mes),
  ]);
  if (vendasQ.error) throw new Error(`Erro ao carregar as vendas: ${vendasQ.error.message}`);
  if (ticketsQ.error) throw new Error(`Erro ao carregar os tickets: ${ticketsQ.error.message}`);

  const vendas = vendasQ.data ?? [];
  const tickets = (ticketsQ.data ?? []).map((t) => ({ ...t, id: Number(t.id) }));
  const ids = vendas.map((v) => v.id);
  const { data: clientes } = ids.length
    ? await db.from("vendas_clientes").select("venda_id, nome").in("venda_id", ids)
    : { data: [] as { venda_id: number; nome: string | null }[] };

  return {
    vendas,
    tickets,
    resumo: resumir(vendas, tickets),
    faixaSugerida: margem.faixa,
    clientes: new Map((clientes ?? []).map((c) => [Number(c.venda_id), c.nome ?? ""])),
  };
}

const dataBR = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
const horaBR = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";

/** Uma linha por venda do mês, no formato do relatório (CSV e PDF). Nome do cliente: só o primeiro. */
export function linhasDoRelatorio(d: DadosFechamento, faixa: Faixa): LinhaRelatorio[] {
  return d.vendas.map((v) => {
    const t = v.ticket_id ? d.tickets.find((x) => x.id === v.ticket_id) : undefined;
    const conta = v.status === "pago" && v.ticket_id !== null;
    const primeiro = (d.clientes.get(v.id) ?? "").trim().split(/\s+/)[0] || "Cliente";
    return {
      data: dataBR(v.data),
      hora: horaBR(v.pago_em),
      cliente: v.final_lead ? `${primeiro} -${v.final_lead}` : primeiro,
      ticket: t ? precoCurto(centavos(t.valor_bruto)) : "sem ticket",
      status: v.status,
      bruto: conta ? centavos(v.snap_bruto ?? t?.valor_bruto) : null,
      liquido: conta ? centavos(v.snap_liquido ?? t?.valor_liquido) : null,
      comissao: conta ? centavos(v[`snap_comissao_${faixa}`] ?? t?.[`comissao_${faixa}`]) : null,
    };
  });
}

/** 123456 → "1234,56" (número para planilha, sem "R$") */
const numeroBR = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));

/** CSV do fechamento (separador ";" e BOM, para abrir certo no Excel em português). */
export function csvDoFechamento(nomeVendedor: string, mesNome: string, faixa: Faixa, r: Resumo, linhas: LinhaRelatorio[]): string {
  const cel = (v: string | number) => {
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linha = (...vs: (string | number)[]) => vs.map(cel).join(";");
  return (
    "﻿" +
    [
      linha("Fechamento", mesNome),
      linha("Vendedor", nomeVendedor),
      linha("Vendas pagas com ticket", r.qtd),
      linha("Vendas pagas sem ticket (sem comissão)", r.semTicket),
      linha("Faturamento bruto", numeroBR(r.bruto)),
      linha("Líquido", numeroBR(r.liquido)),
      linha("Margem de comissão", `${faixa}%`),
      linha("Comissão", numeroBR(r.comissao[faixa])),
      linha("Reembolsos", r.reembolsos),
      linha("Chargebacks", r.chargebacks),
      "",
      linha("Data", "Hora", "Cliente", "Ticket", "Status", "Bruto de ticket", "Líquido de ticket", `Comissão ${faixa}%`),
      ...linhas.map((l) => linha(l.data, l.hora, l.cliente, l.ticket, l.status, numeroBR(l.bruto), numeroBR(l.liquido), numeroBR(l.comissao))),
    ].join("\r\n") +
    "\r\n"
  );
}

export type Relatorio = {
  mes: string;
  vendedor: string;
  faixa: Faixa;
  fechadoEm: string;
  dados: DadosFechamento;
  linhas: LinhaRelatorio[];
  /** as vendas mudaram depois do fechamento: exportar só depois de atualizar */
  desatualizado: boolean;
};

/** Tudo que o CSV e o PDF mostram. Só de mês FECHADO (o % vem do fechamento); senão null. */
export async function carregarRelatorio(mes: string, vendedorId: number): Promise<Relatorio | null> {
  const db = createAdminClient();
  const [fechamentoQ, equipeQ] = await Promise.all([
    db
      .from("vendas_fechamentos")
      .select("faixa, fechado_em, qtd, bruto, comissao, reembolsos, chargebacks")
      .eq("mes", `${mes}-01`)
      .eq("vendedor_id", vendedorId)
      .maybeSingle(),
    db.from("equipe").select("nome").eq("id", vendedorId).maybeSingle(),
  ]);
  if (fechamentoQ.error) throw new Error(`Erro ao carregar o fechamento: ${fechamentoQ.error.message}`);
  if (!fechamentoQ.data || !equipeQ.data) return null;

  const f = fechamentoQ.data;
  const faixa = Number(f.faixa) as Faixa;
  const dados = await dadosDoFechamento(mes, vendedorId);
  const r = dados.resumo;
  const desatualizado =
    Number(f.qtd) !== r.qtd ||
    centavos(f.bruto) !== r.bruto ||
    centavos(f.comissao) !== r.comissao[faixa] ||
    Number(f.reembolsos) !== r.reembolsos ||
    Number(f.chargebacks) !== r.chargebacks;
  return {
    desatualizado,
    mes,
    vendedor: String(equipeQ.data.nome),
    faixa,
    fechadoEm: String(f.fechado_em),
    dados,
    linhas: linhasDoRelatorio(dados, faixa),
  };
}

/** ?mes=AAAA-MM&vendedor=<id> da URL; inválido → null. */
export function lerParametrosRelatorio(mes: unknown, vendedor: unknown): { mes: string; vendedorId: number } | null {
  const m = typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null;
  const v = typeof vendedor === "string" && /^\d+$/.test(vendedor) ? Number(vendedor) : null;
  return m && v ? { mes: m, vendedorId: v } : null;
}
