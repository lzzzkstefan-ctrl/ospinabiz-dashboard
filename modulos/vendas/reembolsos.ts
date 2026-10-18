// Pedidos de reembolso da Hubla (vendas_reembolsos). Contexto em docs/modulos/vendas.md ("Reembolsos").
// - processarPedido: eventos refund_request.* e invoice.refunded, chamados por processar.ts;
// - verificarLembretes: pg_cron a cada 15 min (lembrete de 24h pendente e de prazo < 24h);
// - carregarReembolsos / contarPendentes: leitura da tela (RLS do usuário logado).
// Funções puras (prazo, lembretes, taxa de reversão) em reembolsos-regras.ts.
// Push: admins do sistema, chefes de Vendas e o vendedor dono da venda. Cada aviso tem chave única
// (notificacoes_enviadas): reprocessar o mesmo evento nunca avisa duas vezes.

import { avisarPessoas } from "@/lib/notificacoes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FaturaHubla } from "./hubla";
import { ofertaViral, vendedorDoUtm, type IdHubla } from "./regras";
import { COLUNAS_REEMBOLSO, corpoDoAviso, lembretesDevidos, prazoDoPedido, type LinhaReembolso, type Reembolso } from "./reembolsos-regras";

type Db = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// Eventos da Hubla
// ---------------------------------------------------------------------------

/** refund_request.created / .canceled / .rejected. Devolve o resultado para hubla_eventos. */
export async function processarPedido(db: Db, f: FaturaHubla, recebidoEm: string): Promise<{ resultado: string; vendaId: number | null }> {
  if (!f.pedido) throw new Error("evento de reembolso sem refund.id");
  const pedido = f.pedido;
  const { data: existente, error } = await db.from("vendas_reembolsos").select(COLUNAS_REEMBOLSO).eq("refund_id", pedido.id).maybeSingle<Reembolso>();
  if (error) throw new Error(`erro ao buscar o pedido: ${error.message}`);
  const agora = new Date().toISOString();

  if (f.tipo === "pedido_reembolso_fim") {
    const hubla = f.tipoBruto === "refund_request.rejected" ? "rejected" : "canceled";
    if (existente) {
      if (existente.status !== "pendente") return { resultado: "reembolso_pedido_repetido", vendaId: existente.venda_id };
      const { error: e } = await db
        .from("vendas_reembolsos")
        .update({ status: "revertido", hubla_status: hubla, revertido_em: agora, revertido_via: "hubla", atualizado_em: agora })
        .eq("id", existente.id)
        .eq("status", "pendente");
      if (e) throw new Error(`erro ao encerrar o pedido: ${e.message}`);
      return { resultado: `reembolso_pedido_${hubla}`, vendaId: existente.venda_id };
    }
    // chegou sem o "criado" antes: guarda já encerrado (sem aviso)
    const { linha: novo } = await montarPedido(db, f, recebidoEm);
    const { error: e } = await db
      .from("vendas_reembolsos")
      .upsert({ ...novo, status: "revertido", hubla_status: hubla, revertido_em: agora, revertido_via: "hubla" }, { onConflict: "refund_id", ignoreDuplicates: true });
    if (e) throw new Error(`erro ao gravar o pedido: ${e.message}`);
    return { resultado: `reembolso_pedido_${hubla}`, vendaId: novo.venda_id };
  }

  // pedido novo
  if (existente) {
    await avisarNovo(db, existente); // completa se uma tentativa anterior parou antes do aviso
    return { resultado: "reembolso_pedido_repetido", vendaId: existente.venda_id };
  }
  const { linha, vendaStatus } = await montarPedido(db, f, recebidoEm);
  const jaReembolsada = vendaStatus === "reembolso";
  const { data: gravado, error: e } = await db
    .from("vendas_reembolsos")
    .upsert(
      { ...linha, status: jaReembolsada ? "reembolsado" : "pendente", hubla_status: "created", reembolsado_em: jaReembolsada ? agora : null },
      { onConflict: "refund_id", ignoreDuplicates: true },
    )
    .select(COLUNAS_REEMBOLSO)
    .maybeSingle<Reembolso>();
  if (e) throw new Error(`erro ao gravar o pedido: ${e.message}`);
  if (gravado?.status === "pendente") await avisarNovo(db, gravado);
  return { resultado: "reembolso_pedido", vendaId: linha.venda_id };
}

/** refund_request.accepted e invoice.refunded: o pedido aberto dessa fatura vira "reembolsado". */
export async function pedidoEfetuado(db: Db, f: FaturaHubla, recebidoEm: string): Promise<void> {
  if (!f.idFatura) return;
  const agora = new Date().toISOString();
  const hubla = f.tipoBruto === "refund_request.accepted" ? "accepted" : "refunded";
  const { error } = await db
    .from("vendas_reembolsos")
    .update({ status: "reembolsado", hubla_status: hubla, reembolsado_em: agora, revertido_em: null, revertido_por: null, revertido_via: null, atualizado_em: agora })
    .eq("id_fatura", f.idFatura)
    .neq("status", "reembolsado");
  if (error) throw new Error(`erro ao marcar o pedido como reembolsado: ${error.message}`);

  // aceito sem o "criado" antes: guarda para o histórico
  if (f.pedido && hubla === "accepted") {
    const { linha } = await montarPedido(db, f, recebidoEm);
    const { error: e } = await db
      .from("vendas_reembolsos")
      .upsert({ ...linha, status: "reembolsado", hubla_status: "accepted", reembolsado_em: agora }, { onConflict: "refund_id", ignoreDuplicates: true });
    if (e) throw new Error(`erro ao gravar o pedido: ${e.message}`);
  }
}

async function montarPedido(db: Db, f: FaturaHubla, recebidoEm: string) {
  const [venda, vendedores, idsViral, config] = await Promise.all([
    db.from("vendas").select("id, vendedor_id, linha, pago_em, status").eq("id_fatura", f.idFatura!).maybeSingle(),
    db.from("vendedores").select("equipe_id, utm_term, ativo"),
    db.from("vendas_produtos_hubla").select("hubla_id, tipo").eq("ativo", true),
    db.from("vendas_config").select("reembolso_prazo_dias").maybeSingle(),
  ]);
  for (const r of [venda, vendedores, idsViral, config]) if (r.error) throw new Error(`erro ao ler dados do pedido: ${r.error.message}`);

  const v = venda.data as { id: number; vendedor_id: number | null; linha: LinhaReembolso; pago_em: string | null; status: string } | null;
  const viral = ofertaViral([...f.principais, ...f.ofertasBump], (idsViral.data ?? []) as IdHubla[]);
  const pagoEm = f.pagoEm ?? v?.pago_em ?? null;
  const pedidoEm = f.pedido?.criadoEm ?? recebidoEm;
  const dias = Number((config.data as { reembolso_prazo_dias?: number } | null)?.reembolso_prazo_dias ?? 7);
  const linha = {
    refund_id: f.pedido!.id,
    id_fatura: f.idFatura!,
    venda_id: v?.id ?? null,
    vendedor_id: v?.vendedor_id ?? vendedorDoUtm(f.utmTerm, vendedores.data ?? []),
    utm_term: f.utmTerm,
    linha: v?.linha ?? (viral ? "viral" : "gcs"),
    produto: (viral ?? f.principais[0])?.nome ?? f.itens[0] ?? null,
    valor: f.valorTotalCentavos == null ? null : f.valorTotalCentavos / 100,
    cliente_nome: f.nome,
    cliente_telefone: f.telefone,
    motivo: f.pedido?.motivo?.slice(0, 1000) ?? null,
    pago_em: pagoEm,
    pedido_em: pedidoEm,
    prazo: prazoDoPedido(pagoEm, pedidoEm, dias),
    auto_aceite: f.pedido?.autoAceite ?? null,
  };
  return { linha, vendaStatus: v?.status ?? null };
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

/** Admins do sistema, chefes de Vendas e a pessoa do vendedor dono. */
export async function destinatarios(db: Db, vendedorId: number | null): Promise<string[]> {
  const [{ data: usuarios, error }, dono] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 200 }),
    vendedorId ? db.from("equipe").select("usuario_id").eq("id", vendedorId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (error) throw new Error(`erro ao ler usuários: ${error.message}`);
  const ids = (usuarios?.users ?? [])
    .filter((u) => {
      const m = (u.app_metadata ?? {}) as { papel?: string; vendas?: string };
      return m.papel === "admin" || m.vendas === "chefe";
    })
    .map((u) => u.id);
  const doDono = (dono.data as { usuario_id: string | null } | null)?.usuario_id;
  if (doDono) ids.push(doDono);
  return ids;
}

const urlDoPedido = (id: number) => `/vendas/reembolsos?id=${id}`;

async function avisarNovo(db: Db, r: Reembolso): Promise<void> {
  if (r.status !== "pendente") return;
  try {
    await avisarPessoas(
      db,
      "reembolso",
      `pedido:${r.id}`,
      { titulo: "Reembolso solicitado", corpo: corpoDoAviso(r, new Date()), url: urlDoPedido(r.id), importante: true },
      await destinatarios(db, r.vendedor_id),
    );
  } catch (e) {
    // o pedido já está gravado: falha no push não faz a Hubla reenviar nem trava o evento
    console.error("[reembolsos] aviso do pedido não saiu:", e instanceof Error ? e.message : e);
  }
}

/** pg_cron (15 min): liga pedido à venda que chegou depois e manda os lembretes devidos. */
export async function verificarLembretes(agora = new Date()): Promise<{ pendentes: number; lembretes: number }> {
  const db = createAdminClient();
  const { data, error } = await db.from("vendas_reembolsos").select(COLUNAS_REEMBOLSO).eq("status", "pendente").returns<Reembolso[]>();
  if (error) throw new Error(`erro ao ler pedidos pendentes: ${error.message}`);

  let lembretes = 0;
  for (const r of data) {
    if (r.venda_id === null) {
      const { data: v } = await db.from("vendas").select("id, vendedor_id").eq("id_fatura", r.id_fatura).maybeSingle();
      if (v) {
        r.venda_id = v.id;
        r.vendedor_id ??= v.vendedor_id;
        await db.from("vendas_reembolsos").update({ venda_id: r.venda_id, vendedor_id: r.vendedor_id, atualizado_em: agora.toISOString() }).eq("id", r.id);
      }
    }
    for (const qual of lembretesDevidos(r, agora)) {
      const aviso =
        qual === "24h"
          ? { titulo: "Reembolso pendente há 24h", corpo: corpoDoAviso(r, agora) }
          : { titulo: "Reembolso: faltam menos de 24h", corpo: corpoDoAviso(r, agora) };
      try {
        lembretes += await avisarPessoas(db, "reembolso", `${qual}:${r.id}`, { ...aviso, url: urlDoPedido(r.id), importante: true }, await destinatarios(db, r.vendedor_id));
      } catch (e) {
        console.error("[reembolsos] lembrete não saiu:", e instanceof Error ? e.message : e);
      }
    }
  }
  return { pendentes: data.length, lembretes };
}

// ---------------------------------------------------------------------------
// Tela (cliente do usuário logado: o RLS mostra ao vendedor só os pedidos dele)
// ---------------------------------------------------------------------------

export type TelaReembolsos = {
  pendentes: Reembolso[];
  doMes: Reembolso[];
  /** nome de quem marcou como revertido (usuario_id → nome na equipe) */
  quemReverteu: Record<string, string>;
};

/** Pendentes (todos, o mais urgente primeiro) e os pedidos feitos no mês (histórico). */
export async function carregarReembolsos(mes: string): Promise<TelaReembolsos> {
  const supabase = await createClient();
  const inicio = new Date(`${mes}-01T03:00:00Z`); // meia-noite em Brasília
  const fim = new Date(inicio);
  fim.setUTCMonth(fim.getUTCMonth() + 1);
  const [pendentes, doMes] = await Promise.all([
    supabase.from("vendas_reembolsos").select(COLUNAS_REEMBOLSO).eq("status", "pendente").order("prazo", { ascending: true, nullsFirst: false }).order("pedido_em").returns<Reembolso[]>(),
    supabase.from("vendas_reembolsos").select(COLUNAS_REEMBOLSO).gte("pedido_em", inicio.toISOString()).lt("pedido_em", fim.toISOString()).order("pedido_em", { ascending: false }).returns<Reembolso[]>(),
  ]);
  if (pendentes.error) throw new Error(`Erro ao carregar reembolsos: ${pendentes.error.message}`);
  if (doMes.error) throw new Error(`Erro ao carregar reembolsos: ${doMes.error.message}`);

  // só os nomes de quem aparece nos pedidos que o RLS já liberou
  const ids = [...new Set(doMes.data.map((r) => r.revertido_por).filter((x): x is string => !!x))];
  const quemReverteu: Record<string, string> = {};
  if (ids.length) {
    const { data } = await createAdminClient().from("equipe").select("usuario_id, nome").in("usuario_id", ids);
    for (const e of data ?? []) quemReverteu[e.usuario_id as string] = e.nome as string;
  }
  return { pendentes: pendentes.data, doMes: doMes.data, quemReverteu };
}

/** Quantos pendentes a pessoa vê (contador do link em Vendas). */
export async function contarPendentes(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("vendas_reembolsos").select("id", { count: "exact", head: true }).eq("status", "pendente");
  return count ?? 0;
}

/** Dias de garantia usados no prazo (Configuração de vendas). */
export async function diasDeGarantia(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("vendas_config").select("reembolso_prazo_dias").maybeSingle();
  return Number(data?.reembolso_prazo_dias ?? 7);
}
