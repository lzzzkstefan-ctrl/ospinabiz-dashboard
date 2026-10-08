// Leitura do módulo Vendas para as telas.
// - Vendas: cliente do usuário logado (o RLS mostra ao vendedor só as dele; o resto, só ao admin).
// - Margem do mês: chave secreta no servidor, porque usa o faturamento da operação
//   inteira; para o vendedor a tela passa só a faixa, nunca a margem nem os custos.

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  calcularMargem,
  centavos,
  custosDoMes,
  intervaloMes,
  mesDe,
  resumir,
  type EntradasMes,
  type Faixa,
  type Resumo,
  type Margem,
  type Ticket,
  type Venda,
} from "./regras";

export type Vendedor = { equipe_id: number; nome: string; utm_term: string; ativo: boolean; usuario_id: string | null };

export const COLUNAS_VENDA =
  "id, id_fatura, vendedor_id, sem_vendedor, forma_atribuicao, atribuida_em, utm_term, ticket_id, motivo_sem_ticket, itens, bumps, valor_pago, status, pago_em, data, reembolsado_em, final_lead, origem, " +
  "snap_bruto, snap_liquido, snap_comissao_6, snap_comissao_7, snap_comissao_8, snap_comissao_9, snap_comissao_10";

/** Supabase devolve no máximo 1000 linhas por consulta: busca em páginas. */
async function todasAsPaginas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw new Error(`Erro ao carregar vendas: ${error.message}`);
    tudo.push(...(data ?? []));
    if (!data || data.length < 1000) return tudo;
  }
}

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
  /** só admin: sem dono ou nova paga sem ticket (para o vendedor, sempre vazio) */
  aRevisar: Venda[];
};

/** Vendas que a pessoa logada pode ver: do mês, de hoje, reembolsadas hoje e (admin) "A revisar". */
export async function carregarPainel(mes: string, hoje: string, admin: boolean): Promise<DadosPainel> {
  const supabase = await createClient();
  const { inicio, fim } = intervaloMes(mes);
  const ontemUtc = new Date(Date.now() - 36 * 3600 * 1000).toISOString();

  const [vendasMes, hojeQ, reembQ, revisarQ] = await Promise.all([
    todasAsPaginas<Venda>((de, ate) =>
      supabase.from("vendas").select(COLUNAS_VENDA).gte("data", inicio).lt("data", fim).order("pago_em", { ascending: false }).order("id").range(de, ate).returns<Venda[]>(),
    ),
    supabase.from("vendas").select(COLUNAS_VENDA).eq("data", hoje).returns<Venda[]>(),
    supabase.from("vendas").select(COLUNAS_VENDA).gte("reembolsado_em", ontemUtc).returns<Venda[]>(),
    admin
      ? supabase
          .from("vendas")
          .select(COLUNAS_VENDA)
          .or("and(vendedor_id.is.null,sem_vendedor.eq.false),and(status.eq.pago,ticket_id.is.null,origem.neq.importacao)")
          .order("pago_em", { ascending: false })
          .returns<Venda[]>()
      : null,
  ]);
  for (const q of [hojeQ, reembQ, revisarQ]) if (q?.error) throw new Error(`Erro ao carregar vendas: ${q.error.message}`);

  const diaDoReembolso = (v: Venda) =>
    v.reembolsado_em ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(v.reembolsado_em)) : null;

  return {
    vendasMes,
    vendasHoje: hojeQ.data ?? [],
    reembolsosHoje: (reembQ.data ?? []).filter((v) => diaDoReembolso(v) === hoje),
    aRevisar: revisarQ?.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Fechamento do mês (por vendedor) e histórico
// ---------------------------------------------------------------------------
export type Fechamento = {
  mes: string; // "AAAA-MM"
  vendedor_id: number;
  faixa: Faixa;
  faixa_sugerida: Faixa | null;
  qtd: number;
  sem_ticket: number;
  bruto: number; // centavos
  liquido: number;
  comissao: number;
  reembolsos: number;
  chargebacks: number;
  fechado_em: string;
};

function normalizarFechamento(f: Record<string, unknown>): Fechamento {
  return {
    mes: String(f.mes).slice(0, 7),
    vendedor_id: Number(f.vendedor_id),
    faixa: Number(f.faixa) as Faixa,
    faixa_sugerida: f.faixa_sugerida == null ? null : (Number(f.faixa_sugerida) as Faixa),
    qtd: Number(f.qtd),
    sem_ticket: Number(f.sem_ticket),
    bruto: centavos(f.bruto as string),
    liquido: centavos(f.liquido as string),
    comissao: centavos(f.comissao as string),
    reembolsos: Number(f.reembolsos),
    chargebacks: Number(f.chargebacks),
    fechado_em: String(f.fechado_em),
  };
}

/** Fechamentos que a pessoa logada pode ver (o RLS mostra ao vendedor só os dele). mes = "AAAA-MM" ou todos. */
export async function listarFechamentos(mes?: string): Promise<Fechamento[]> {
  const supabase = await createClient();
  let q = supabase.from("vendas_fechamentos").select("*").order("mes", { ascending: false });
  if (mes) q = q.eq("mes", `${mes}-01`);
  const { data, error } = await q;
  if (error) throw new Error(`Erro ao carregar fechamentos: ${error.message}`);
  return data.map(normalizarFechamento);
}

export type MesHistorico = { mes: string; resumo: Resumo; fechamento: Fechamento | null };

/** Histórico mês a mês de um vendedor (o RLS garante que o vendedor só vê o dele). */
export async function historicoDoVendedor(vendedorId: number, tickets: Ticket[]): Promise<MesHistorico[]> {
  const supabase = await createClient();
  const [vendas, fechamentos] = await Promise.all([
    todasAsPaginas<Venda>((de, ate) =>
      supabase.from("vendas").select(COLUNAS_VENDA).eq("vendedor_id", vendedorId).order("id").range(de, ate).returns<Venda[]>(),
    ),
    listarFechamentos(),
  ]);
  const meses = new Map<string, Venda[]>();
  for (const v of vendas) meses.set(mesDe(v.data), [...(meses.get(mesDe(v.data)) ?? []), v]);
  return [...meses.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mes, doMes]) => ({
      mes,
      resumo: resumir(doMes, tickets),
      fechamento: fechamentos.find((f) => f.mes === mes && f.vendedor_id === vendedorId) ?? null,
    }));
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
    db.from("vendas").select(COLUNAS_VENDA).gte("data", inicio).lt("data", fim).returns<Venda[]>(),
    db.from("tickets").select("*"),
    db.from("vendas_meses").select("gasto_anuncios, imposto_meta, custo_mensagens").eq("mes", inicio).maybeSingle(),
    db.from("custos_fixos").select("id, nome, desativado_desde"),
    db.from("custos_fixos_valores").select("custo_id, vigente_desde, valor"),
  ]);
  for (const q of [vendas, tickets, mesQ, custos, valores]) if (q.error) throw new Error(`Erro ao calcular a margem: ${q.error.message}`);

  const resumo = resumir(vendas.data ?? [], (tickets.data ?? []).map(normalizarTicket));
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
