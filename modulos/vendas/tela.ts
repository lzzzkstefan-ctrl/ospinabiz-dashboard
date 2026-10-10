// Leitura da tela de Vendas (formato Lock in), por vendedor.
// - Vendas, adiantamentos, observações e fechamentos: cliente do usuário logado. O RLS
//   mostra ao vendedor só o que é dele; o admin vê tudo.
// - Nome do cliente: a tabela vendas_clientes é só do admin. Para o vendedor, o servidor
//   lê com a chave secreta SÓ das vendas que o RLS já liberou para ele e devolve só
//   "primeiro nome -1234" (decisão do Davi, 08/10/2026). Nunca telefone completo nem e-mail.
// - % sugerido pela margem: calculado com a chave secreta (usa a operação inteira);
//   sai daqui só a faixa, nunca a margem nem os custos.

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { corDoTicket } from "./cores";
import { type AjusteLI, type EstornoLI, type PlataformaLI, type TicketLI, type VendaLI } from "./lock-in";
import { calcularMargem, centavos, custosDoMes, resumir, type Faixa, type Ticket, type Venda } from "./regras";

const COLUNAS =
  "id, id_fatura, vendedor_id, sem_vendedor, ticket_id, principal_produto, motivo_sem_ticket, itens, bumps, status, data, pago_em, final_lead, origem, plataforma, " +
  "snap_bruto, snap_liquido, snap_comissao_6, snap_comissao_7, snap_comissao_8, snap_comissao_9, snap_comissao_10, receita_liquida, teste, aguardando_confirmacao";

async function todas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw new Error(`Erro ao carregar vendas: ${error.message}`);
    tudo.push(...(data ?? []));
    if (!data || data.length < 1000) return tudo;
  }
}

export async function listarTicketsLI(): Promise<TicketLI[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tickets").select("*").order("ordem").order("valor_bruto");
  if (error) throw new Error(`Erro ao carregar tickets: ${error.message}`);
  return data.map((t) => ({
    id: Number(t.id),
    nome: t.nome ?? `R$ ${Number(t.valor_bruto).toLocaleString("pt-BR")}`,
    cor: corDoTicket(centavos(t.valor_bruto), t.cor),
    ordem: Number(t.ordem ?? 0),
    provisorio: Boolean(t.provisorio),
    ativo: Boolean(t.ativo),
    valor_bruto: Number(t.valor_bruto),
    valor_liquido: Number(t.valor_liquido),
    comissao_6: Number(t.comissao_6),
    comissao_7: Number(t.comissao_7),
    comissao_8: Number(t.comissao_8),
    comissao_9: Number(t.comissao_9),
    comissao_10: Number(t.comissao_10),
  }));
}

/** Plataformas cadastradas, na ordem da tela (todo logado lê). */
export async function listarPlataformas(): Promise<PlataformaLI[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plataformas").select("slug, nome, cor, ativa, ordem").order("ordem").order("nome");
  if (error) throw new Error(`Erro ao carregar plataformas: ${error.message}`);
  return data;
}

/** "Lucas -1389": primeiro nome + final. */
function clienteCurto(nome: string | null | undefined, final: string | null): string {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  const n = primeiro ? primeiro[0].toUpperCase() + primeiro.slice(1).toLowerCase() : "Cliente";
  return final ? `${n} -${final}` : n;
}

/** vendedorId: um vendedor, ou null = todas que a pessoa pode ver (visão Geral do admin). */
export async function carregarVendas(vendedorId: number | null, inicio: string, fim: string): Promise<VendaLI[]> {
  const supabase = await createClient();
  const brutas = await todas<Omit<VendaLI, "cliente">>((de, ate) => {
    let q = supabase.from("vendas").select(COLUNAS).gte("data", inicio).lt("data", fim);
    if (vendedorId !== null) q = q.eq("vendedor_id", vendedorId);
    return q.order("data").order("id").range(de, ate).returns<Omit<VendaLI, "cliente">[]>();
  });
  if (brutas.length === 0) return [];

  // só as vendas que o RLS já liberou; daqui sai só o primeiro nome
  const db = createAdminClient();
  const nomes = new Map<number, string | null>();
  const ids = brutas.map((v) => v.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await db.from("vendas_clientes").select("venda_id, nome").in("venda_id", ids.slice(i, i + 500));
    if (error) throw new Error(`Erro ao carregar clientes: ${error.message}`);
    for (const c of data) nomes.set(c.venda_id as number, c.nome as string | null);
  }
  return brutas.map((v) => ({ ...v, cliente: clienteCurto(nomes.get(v.id), v.final_lead) }));
}

export type MesVendedor = { observacoes: string; codigo: string | null };

export async function mesDoVendedor(mes: string, vendedorId: number): Promise<MesVendedor> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendas_meses_vendedor")
    .select("observacoes, codigo_publico")
    .eq("mes", `${mes}-01`)
    .eq("vendedor_id", vendedorId)
    .maybeSingle();
  return { observacoes: data?.observacoes ?? "", codigo: data?.codigo_publico ?? null };
}

export type Adiantamento = { id: number; mes: string; valor: number; data: string };

/** Adiantamentos de um vendedor no ano (o RLS mostra ao vendedor só os dele). */
export async function listarAdiantamentos(vendedorId: number, ano: number): Promise<Adiantamento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendas_adiantamentos")
    .select("id, mes, valor, data")
    .eq("vendedor_id", vendedorId)
    .gte("mes", `${ano}-01-01`)
    .lt("mes", `${ano + 1}-01-01`)
    .order("data");
  if (error) throw new Error(`Erro ao carregar adiantamentos: ${error.message}`);
  return data.map((a) => ({ id: Number(a.id), mes: String(a.mes).slice(0, 7), valor: centavos(a.valor), data: String(a.data) }));
}

/** comissao = congelada no fechamento; estornos = descontados nele (centavos) */
export type FechamentoLI = { mes: string; faixa: Faixa; qtd: number; semTicket: number; comissao: number; estornos: number; fechado_em: string };

export async function listarFechamentosLI(vendedorId: number, ano: number): Promise<FechamentoLI[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendas_fechamentos")
    .select("mes, faixa, qtd, sem_ticket, comissao, estornos, fechado_em")
    .eq("vendedor_id", vendedorId)
    .gte("mes", `${ano}-01-01`)
    .lt("mes", `${ano + 1}-01-01`);
  if (error) throw new Error(`Erro ao carregar fechamentos: ${error.message}`);
  // qtd do Lock in = todas as pagas (no banco: qtd com ticket + sem_ticket)
  return data.map((f) => ({
    mes: String(f.mes).slice(0, 7),
    faixa: Number(f.faixa) as Faixa,
    qtd: Number(f.qtd) + Number(f.sem_ticket),
    semTicket: Number(f.sem_ticket),
    comissao: centavos(f.comissao),
    estornos: centavos(f.estornos),
    fechado_em: String(f.fechado_em),
  }));
}

export type EstornoDoVendedor = EstornoLI & { descontadoNoMes: string | null };

/** Estornos do vendedor que valem (não cancelados). O RLS mostra ao vendedor só os dele. */
export async function listarEstornos(vendedorId: number): Promise<EstornoDoVendedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendas_estornos")
    .select("id, venda_id, mes_origem, valor, motivo, descontado_no_mes")
    .eq("vendedor_id", vendedorId)
    .is("cancelado_em", null)
    .order("criado_em");
  if (error) throw new Error(`Erro ao carregar estornos: ${error.message}`);
  return data.map((e) => ({
    id: Number(e.id),
    vendaId: e.venda_id === null ? null : Number(e.venda_id),
    mesOrigem: String(e.mes_origem).slice(0, 7),
    valor: centavos(e.valor),
    motivo: e.motivo as EstornoLI["motivo"],
    descontadoNoMes: e.descontado_no_mes ? String(e.descontado_no_mes).slice(0, 7) : null,
  }));
}

/** Ajustes manuais do vendedor no ano (o RLS mostra ao vendedor só os dele). */
export async function listarAjustes(vendedorId: number, ano: number): Promise<AjusteLI[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendas_ajustes")
    .select("id, mes, valor, motivo")
    .eq("vendedor_id", vendedorId)
    .gte("mes", `${ano}-01-01`)
    .lt("mes", `${ano + 1}-01-01`)
    .order("criado_em");
  if (error) throw new Error(`Erro ao carregar ajustes: ${error.message}`);
  return data.map((a) => ({ id: Number(a.id), mes: String(a.mes).slice(0, 7), valor: centavos(a.valor), motivo: String(a.motivo) }));
}

export type Alteracao = {
  id: number;
  em: string;
  quem: string;
  tipo: string;
  vendaId: number | null;
  motivo: string | null;
  campos: { campo: string; antes: unknown; depois: unknown }[];
};

/** Registro de alterações do mês fechado de um vendedor (só admin: o RLS devolve vazio ao vendedor). */
export async function listarAlteracoes(mes: string, vendedorId: number): Promise<Alteracao[]> {
  const supabase = await createClient();
  const [{ data, error }, equipe] = await Promise.all([
    supabase
      .from("vendas_alteracoes")
      .select("id, em, por, via, tipo, venda_id, motivo, antes, depois")
      .eq("mes", `${mes}-01`)
      .eq("vendedor_id", vendedorId)
      .order("em", { ascending: false })
      .limit(100),
    supabase.from("equipe").select("nome, usuario_id"),
  ]);
  if (error) throw new Error(`Erro ao carregar alterações: ${error.message}`);
  const nomePorUsuario = new Map((equipe.data ?? []).map((p) => [p.usuario_id, String(p.nome)]));
  return data.map((a) => {
    const antes = (a.antes ?? {}) as Record<string, unknown>;
    const depois = (a.depois ?? {}) as Record<string, unknown>;
    const campos = a.tipo === "venda_alterada" ? Object.keys(depois).map((campo) => ({ campo, antes: antes[campo], depois: depois[campo] })) : [];
    return {
      id: Number(a.id),
      em: String(a.em),
      quem: a.via === "hubla" ? "sistema (Hubla)" : (nomePorUsuario.get(a.por) ?? "admin"),
      tipo: String(a.tipo),
      vendaId: a.venda_id === null ? null : Number(a.venda_id),
      motivo: a.motivo ?? null,
      campos,
    };
  });
}

/** % sugerido pela margem da operação em cada mês do ano (null = falta valor do mês). */
export async function faixasSugeridas(ano: number): Promise<Map<string, Faixa | null>> {
  const db = createAdminClient();
  const [vendas, tickets, meses, custos, valores] = await Promise.all([
    todas<Venda>((de, ate) =>
      db
        .from("vendas")
        .select("id, status, ticket_id, snap_bruto, snap_liquido, snap_comissao_6, snap_comissao_7, snap_comissao_8, snap_comissao_9, snap_comissao_10, data")
        .gte("data", `${ano}-01-01`)
        .lt("data", `${ano + 1}-01-01`)
        .eq("aguardando_confirmacao", false)
        .order("id")
        .range(de, ate)
        .returns<Venda[]>(),
    ),
    db.from("tickets").select("*"),
    db.from("vendas_meses").select("mes, gasto_anuncios, imposto_meta, custo_mensagens").gte("mes", `${ano}-01-01`).lt("mes", `${ano + 1}-01-01`),
    db.from("custos_fixos").select("id, nome, desativado_desde"),
    db.from("custos_fixos_valores").select("custo_id, vigente_desde, valor"),
  ]);
  for (const q of [tickets, meses, custos, valores]) if (q.error) throw new Error(`Erro ao calcular a margem: ${q.error.message}`);
  const ts = (tickets.data ?? []).map((t) => ({ ...t, valor_bruto: Number(t.valor_bruto), valor_liquido: Number(t.valor_liquido) })) as Ticket[];
  const valoresNum = (valores.data ?? []).map((v) => ({ ...v, valor: v.valor === null ? null : Number(v.valor) }));

  const r = new Map<string, Faixa | null>();
  for (let m = 1; m <= 12; m++) {
    const chave = `${ano}-${String(m).padStart(2, "0")}`;
    const linha = (meses.data ?? []).find((x) => String(x.mes).startsWith(chave));
    const liquido = resumir(vendas.filter((v) => v.data.startsWith(chave)), ts).liquido;
    const totalCustos = custosDoMes(chave, custos.data ?? [], valoresNum).reduce((s, c) => s + (c.valor ?? 0), 0);
    const margem = calcularMargem(
      liquido,
      {
        gastoAnuncios: linha?.gasto_anuncios == null ? null : centavos(linha.gasto_anuncios),
        impostoMeta: linha?.imposto_meta == null ? null : centavos(linha.imposto_meta),
        custoMensagens: linha?.custo_mensagens == null ? null : centavos(linha.custo_mensagens),
      },
      totalCustos,
    );
    r.set(chave, margem.faixa);
  }
  return r;
}

/** WhatsApp do Rodrigo (só admin; para os outros volta null). */
export async function whatsappFechamento(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("vendas_config").select("whatsapp_fechamento").maybeSingle();
  return data?.whatsapp_fechamento ?? null;
}

// ---------------------------------------------------------------------------
// Link público /r/<código>: sem login, então lê com a chave secreta e devolve só
// campos escolhidos a dedo (primeiro nome + final, ticket, status, data, id da fatura).
// ---------------------------------------------------------------------------
export type VendaPublica = {
  cliente: string;
  ticket: string | null;
  cor: string | null;
  provisorio: boolean;
  produto: boolean;
  oferta: string | null;
  status: string;
  data: string;
  pagoEm: string | null;
  idFatura: string;
  plataforma: string;
};

const FORMATO_CODIGO = /^[A-Za-z0-9_-]{32,64}$/;

export async function buscarMesPublico(codigo: string) {
  if (!FORMATO_CODIGO.test(codigo)) return null;
  const db = createAdminClient();
  const { data: linha } = await db.from("vendas_meses_vendedor").select("mes, vendedor_id").eq("codigo_publico", codigo).maybeSingle();
  if (!linha) return null;
  const mes = String(linha.mes).slice(0, 7);
  const vendedorId = Number(linha.vendedor_id);
  const [a, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);

  const [vendas, ticketsQ, fechamento, adiant, plataformasQ] = await Promise.all([
    todas<Omit<VendaLI, "cliente">>((de, ate) =>
      db.from("vendas").select(COLUNAS).eq("vendedor_id", vendedorId).eq("aguardando_confirmacao", false).gte("data", `${mes}-01`).lt("data", fim).order("data").order("pago_em").range(de, ate).returns<Omit<VendaLI, "cliente">[]>(),
    ),
    db.from("tickets").select("*").order("ordem"),
    db.from("vendas_fechamentos").select("faixa").eq("mes", `${mes}-01`).eq("vendedor_id", vendedorId).maybeSingle(),
    db.from("vendas_adiantamentos").select("valor, data").eq("vendedor_id", vendedorId).eq("mes", `${mes}-01`),
    db.from("plataformas").select("slug, nome, cor, ativa, ordem"),
  ]);
  const nomes = new Map<number, string | null>();
  const ids = vendas.map((v) => v.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from("vendas_clientes").select("venda_id, nome").in("venda_id", ids.slice(i, i + 500));
    for (const c of data ?? []) nomes.set(c.venda_id as number, c.nome as string | null);
  }
  const tickets: TicketLI[] = (ticketsQ.data ?? []).map((t) => ({
    ...t,
    id: Number(t.id),
    nome: t.nome ?? `R$ ${Number(t.valor_bruto)}`,
    cor: corDoTicket(centavos(t.valor_bruto), t.cor),
    ordem: Number(t.ordem ?? 0),
    provisorio: Boolean(t.provisorio),
    valor_bruto: Number(t.valor_bruto),
    valor_liquido: Number(t.valor_liquido),
  }));
  const lista: VendaLI[] = vendas.map((v) => ({ ...v, cliente: clienteCurto(nomes.get(v.id), v.final_lead) }));
  const porId = new Map(tickets.map((t) => [t.id, t]));
  return {
    mes,
    margem: (fechamento.data?.faixa ?? null) as Faixa | null,
    vendas: lista,
    tickets,
    plataformas: (plataformasQ.data ?? []) as PlataformaLI[],
    adiantamentos: (adiant.data ?? []).map((x) => ({ valor: centavos(x.valor), data: String(x.data) })),
    publicas: lista.map((v): VendaPublica => {
      const t = v.ticket_id ? porId.get(v.ticket_id) : undefined;
      return {
        cliente: v.cliente,
        ticket: t?.nome ?? null,
        cor: t?.cor ?? null,
        provisorio: !!t?.provisorio,
        produto: v.principal_produto,
        oferta: t ? null : (v.itens[0] ?? null),
        status: v.status,
        data: v.data,
        pagoEm: v.pago_em,
        idFatura: v.id_fatura,
        plataforma: v.plataforma,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Geral (funções do banco que devolvem SÓ números agregados, nunca uma venda)
// ---------------------------------------------------------------------------
export type LinhaGeral = {
  vendedorId: number | null;
  pagas: number;
  reembolsos: number;
  chargebacks: number;
  bruto: number;
  liquido: number;
  comissao: Record<Faixa, number>;
  receita: number;
  semReceita: number;
  /** só informação: parte do ticket no valor recebido de verdade (com juros); a comissão usa a tabela */
  recebidoReal: number;
};

/** Geral completa (chefe e gerente), por vendedor, em centavos. */
export async function geralCompleta(mes: string): Promise<LinhaGeral[]> {
  const supabase = await createClient();
  const [a, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("vendas_geral_completa", { p_inicio: `${mes}-01`, p_fim: fim });
  if (error) throw new Error(`Erro ao carregar a Geral: ${error.message}`);
  return (data as Record<string, unknown>[]).map((r) => ({
    vendedorId: r.vendedor_id === null ? null : Number(r.vendedor_id),
    pagas: Number(r.pagas),
    reembolsos: Number(r.reembolsos),
    chargebacks: Number(r.chargebacks),
    bruto: centavos(r.bruto as number),
    liquido: centavos(r.liquido as number),
    comissao: { 6: centavos(r.comissao_6 as number), 7: centavos(r.comissao_7 as number), 8: centavos(r.comissao_8 as number), 9: centavos(r.comissao_9 as number), 10: centavos(r.comissao_10 as number) },
    receita: centavos(r.receita as number),
    semReceita: Number(r.sem_receita),
    recebidoReal: centavos(r.recebido_real as number),
  }));
}

/** Geral da equipe (todos): quantidade de vendas pagas e a meta do mês. Sem valores. */
export async function geralEquipe(mes: string): Promise<{ pagas: number; meta: number | null }> {
  const supabase = await createClient();
  const [a, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("vendas_geral_equipe", { p_inicio: `${mes}-01`, p_fim: fim });
  if (error) throw new Error(`Erro ao carregar a equipe: ${error.message}`);
  const r = (data as { pagas: number; meta_qtd: number | null }[])[0];
  return { pagas: Number(r?.pagas ?? 0), meta: r?.meta_qtd == null ? null : Number(r.meta_qtd) };
}
