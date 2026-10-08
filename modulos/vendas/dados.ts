// Leitura do módulo Vendas para as telas.
// - Vendas: cliente do usuário logado (o RLS mostra ao vendedor só as dele e as "A atribuir").
// - Margem do mês: chave secreta no servidor, porque usa o faturamento da operação
//   inteira; para o vendedor a tela passa só a faixa, nunca a margem nem os custos.

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  calcularMargem,
  centavos,
  custosDoMes,
  intervaloMes,
  resumir,
  type EntradasMes,
  type Margem,
  type Ticket,
  type Venda,
} from "./regras";

export type Vendedor = { equipe_id: number; nome: string; utm_term: string; ativo: boolean; usuario_id: string | null };

const COLUNAS_VENDA =
  "id, id_fatura, vendedor_id, sem_vendedor, forma_atribuicao, atribuida_em, utm_term, ticket_id, motivo_sem_ticket, itens, bumps, valor_pago, status, pago_em, data, reembolsado_em, final_lead";

function normalizarTicket(t: Record<string, unknown>): Ticket {
  return {
    id: Number(t.id),
    valor_bruto: Number(t.valor_bruto),
    valor_liquido: Number(t.valor_liquido),
    comissao_6: Number(t.comissao_6),
    comissao_7: Number(t.comissao_7),
    comissao_8: Number(t.comissao_8),
    comissao_9: Number(t.comissao_9),
    comissao_10: Number(t.comissao_10),
    ativo: Boolean(t.ativo),
  };
}

export async function listarVendedores(): Promise<Vendedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("vendedores").select("equipe_id, utm_term, ativo, equipe(nome, usuario_id)");
  if (error) throw new Error(`Erro ao carregar vendedores: ${error.message}`);
  type Bruto = { equipe_id: number; utm_term: string; ativo: boolean; equipe: { nome: string; usuario_id: string | null } };
  return (data as unknown as Bruto[])
    .map((v) => ({ equipe_id: v.equipe_id, utm_term: v.utm_term, ativo: v.ativo, nome: v.equipe.nome, usuario_id: v.equipe.usuario_id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function listarTickets(): Promise<Ticket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tickets").select("*").order("valor_bruto", { ascending: false });
  if (error) throw new Error(`Erro ao carregar tickets: ${error.message}`);
  return data.map(normalizarTicket);
}

export type DadosPainel = {
  vendasMes: Venda[];
  vendasHoje: Venda[];
  reembolsosHoje: Venda[];
  aAtribuir: Venda[];
};

/** Vendas que a pessoa logada pode ver: do mês, de hoje, reembolsadas hoje e "A atribuir". */
export async function carregarPainel(mes: string, hoje: string): Promise<DadosPainel> {
  const supabase = await createClient();
  const { inicio, fim } = intervaloMes(mes);
  const ontemUtc = new Date(Date.now() - 36 * 3600 * 1000).toISOString();

  const [mesQ, hojeQ, reembQ, atribQ] = await Promise.all([
    supabase.from("vendas").select(COLUNAS_VENDA).gte("data", inicio).lt("data", fim).order("pago_em", { ascending: false }),
    supabase.from("vendas").select(COLUNAS_VENDA).eq("data", hoje),
    supabase.from("vendas").select(COLUNAS_VENDA).gte("reembolsado_em", ontemUtc),
    supabase
      .from("vendas")
      .select(COLUNAS_VENDA)
      .is("vendedor_id", null)
      .eq("sem_vendedor", false)
      .order("pago_em", { ascending: false }),
  ]);
  for (const q of [mesQ, hojeQ, reembQ, atribQ]) if (q.error) throw new Error(`Erro ao carregar vendas: ${q.error.message}`);

  const diaDoReembolso = (v: Venda) =>
    v.reembolsado_em ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(v.reembolsado_em)) : null;

  return {
    vendasMes: mesQ.data as Venda[],
    vendasHoje: hojeQ.data as Venda[],
    reembolsosHoje: (reembQ.data as Venda[]).filter((v) => diaDoReembolso(v) === hoje),
    aAtribuir: atribQ.data as Venda[],
  };
}

/** Nome dos clientes (só admin consegue ler; para os outros volta vazio). */
export async function nomesDosClientes(vendaIds: number[]): Promise<Map<number, string>> {
  if (vendaIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("vendas_clientes").select("venda_id, nome").in("venda_id", vendaIds);
  return new Map((data ?? []).map((c) => [c.venda_id as number, (c.nome as string | null) ?? ""]));
}

export type MargemDoMes = Margem & {
  entradas: EntradasMes;
  custos: { id: number; nome: string; valor: number | null }[];
  custosSemValor: string[];
};

/** Margem do mês sobre a operação inteira. Roda no servidor com a chave secreta. */
export async function margemDoMes(mes: string): Promise<MargemDoMes> {
  const db = createAdminClient();
  const { inicio, fim } = intervaloMes(mes);

  const [vendas, tickets, mesQ, custos, valores] = await Promise.all([
    db.from("vendas").select(COLUNAS_VENDA).gte("data", inicio).lt("data", fim),
    db.from("tickets").select("*"),
    db.from("vendas_meses").select("gasto_anuncios, imposto_meta, custo_mensagens").eq("mes", inicio).maybeSingle(),
    db.from("custos_fixos").select("id, nome, desativado_desde"),
    db.from("custos_fixos_valores").select("custo_id, vigente_desde, valor"),
  ]);
  for (const q of [vendas, tickets, mesQ, custos, valores]) if (q.error) throw new Error(`Erro ao calcular a margem: ${q.error.message}`);

  const resumo = resumir(vendas.data as Venda[], (tickets.data ?? []).map(normalizarTicket));
  const doMes = custosDoMes(
    mes,
    custos.data ?? [],
    (valores.data ?? []).map((v) => ({ ...v, valor: v.valor === null ? null : Number(v.valor) })),
  );
  const totalCustos = doMes.reduce((s, c) => s + (c.valor ?? 0), 0);
  const linha = mesQ.data;
  const entradas: EntradasMes = {
    gastoAnuncios: linha?.gasto_anuncios == null ? null : centavos(linha.gasto_anuncios),
    impostoMeta: linha?.imposto_meta == null ? null : centavos(linha.imposto_meta),
    custoMensagens: linha?.custo_mensagens == null ? null : centavos(linha.custo_mensagens),
  };

  return {
    ...calcularMargem(resumo.liquido, entradas, totalCustos),
    entradas,
    custos: doMes,
    custosSemValor: doMes.filter((c) => c.valor === null).map((c) => c.nome),
  };
}

// ---------------------------------------------------------------------------
// Tela de configuração (só admin; o RLS bloqueia os outros)
// ---------------------------------------------------------------------------
export type CustoConfig = { id: number; nome: string; desativado_desde: string | null; valores: { vigente_desde: string; valor: number | null }[] };

export async function listarCustos(): Promise<CustoConfig[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custos_fixos")
    .select("id, nome, desativado_desde, valores:custos_fixos_valores(vigente_desde, valor)")
    .order("nome");
  if (error) throw new Error(`Erro ao carregar custos: ${error.message}`);
  return (data as unknown as CustoConfig[]).map((c) => ({
    ...c,
    valores: c.valores.map((v) => ({ ...v, valor: v.valor === null ? null : Number(v.valor) })),
  }));
}

export type EventoComErro = { id: number; recebido_em: string; tipo: string | null; id_fatura: string | null; erro: string | null; tentativas: number };

/** Eventos com erro ou que nunca terminaram de processar. */
export async function listarEventosComErro(): Promise<EventoComErro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hubla_eventos")
    .select("id, recebido_em, tipo, id_fatura, erro, tentativas")
    .or("erro.not.is.null,processado.eq.false")
    .order("recebido_em", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Erro ao carregar eventos: ${error.message}`);
  return data;
}
