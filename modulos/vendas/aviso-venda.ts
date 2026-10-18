// Push de venda paga (18/10/2026): "💰 Venda R$ 338 · comissão R$ 32,11 · 3ª do dia"; no Viral,
// "💰 Venda R$ 48,90 · Viral · comissão R$ 4,48 · 4ª do dia". Valor = o do ticket (GCS) ou o preço
// da oferta (Viral); "Nª do dia" conta as vendas pagas do dia da equipe toda (GCS + Viral, sem teste).
// Sai uma vez por venda criada pelo webhook da Hubla (chave venda:<id> em notificacoes_enviadas),
// para os admins, os chefes de Vendas e o vendedor dono (os mesmos do aviso de reembolso).
// Comissão na faixa do fechamento do mês; sem fechamento, a sugerida pela margem; sem ela, 10%
// (o mesmo padrão da tela). GCS: a cópia guardada na venda; Viral: líquido × % (comissaoDe).

import { avisarPessoas } from "@/lib/notificacoes";
import type { createAdminClient } from "@/lib/supabase/admin";
import { margemDoMes } from "./dados";
import { destinatarios } from "./reembolsos";
import { rotuloValor } from "./lock-in";
import { centavos, comissaoDe, reais, type Faixa } from "./regras";

type Db = ReturnType<typeof createAdminClient>;

type VendaAviso = {
  id: number;
  status: string;
  teste: boolean | null;
  aguardando_confirmacao: boolean | null;
  vendedor_id: number | null;
  linha: "gcs" | "viral";
  ticket_id: number | null;
  data: string;
  valor_pago: number | string | null;
  snap_bruto: number | string | null;
  viral_preco: number | string | null;
  principal_produto: boolean | null;
  viral_liquido: number | string | null;
} & Record<`snap_comissao_${Faixa}`, number | string | null>;

/** Comissão da venda (centavos) na faixa. Principal é produto (combo, Nexus…) = 0; null = ainda sem
 * base (Viral sem o líquido da Hubla, GCS com ticket a revisar). */
export function comissaoDaVenda(v: VendaAviso, faixa: Faixa): number | null {
  if (v.linha === "viral") return v.viral_liquido == null ? null : comissaoDe(centavos(v.viral_liquido), faixa);
  if (v.ticket_id === null) return v.principal_produto ? 0 : null;
  const c = v[`snap_comissao_${faixa}`];
  return c == null ? null : centavos(c);
}

/** "💰 Venda R$ 48,90 · Viral · comissão R$ 4,48 · 4ª do dia" (GCS sem o "· Viral") */
export function textoAvisoVenda(v: VendaAviso, faixa: Faixa, doDia: number): string {
  const valor = v.linha === "viral" ? (v.viral_preco ?? v.valor_pago) : (v.snap_bruto ?? v.valor_pago);
  const comissao = comissaoDaVenda(v, faixa);
  return [
    `💰 Venda ${valor == null ? "sem valor" : rotuloValor(centavos(valor))}`,
    ...(v.linha === "viral" ? ["Viral"] : []),
    comissao === null ? "comissão a calcular" : `comissão ${reais(comissao)}`,
    `${doDia}ª do dia`,
  ].join(" · ");
}

const COLUNAS = "id, status, teste, aguardando_confirmacao, vendedor_id, linha, ticket_id, principal_produto, data, valor_pago, snap_bruto, viral_preco, viral_liquido, snap_comissao_6, snap_comissao_7, snap_comissao_8, snap_comissao_9, snap_comissao_10";

/** Título, corpo e link do aviso de uma venda. comTeste: conta as vendas de teste no "Nª do dia" (só no teste). */
export async function montarAvisoVenda(db: Db, v: VendaAviso, comTeste = false) {
  const mes = v.data.slice(0, 7);
  let doDia = db.from("vendas").select("id", { count: "exact", head: true }).eq("data", v.data).eq("status", "pago").eq("aguardando_confirmacao", false).lte("id", v.id);
  if (!comTeste) doDia = doDia.eq("teste", false);
  const [vendedor, fechamento, contagem] = await Promise.all([
    v.vendedor_id ? db.from("equipe").select("nome").eq("id", v.vendedor_id).maybeSingle() : Promise.resolve({ data: null }),
    v.vendedor_id
      ? db.from("vendas_fechamentos").select("faixa").eq("mes", `${mes}-01`).eq("vendedor_id", v.vendedor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    doDia,
  ]);
  if (contagem.error) throw new Error(contagem.error.message);
  const fechada = (fechamento.data as { faixa: number } | null)?.faixa as Faixa | undefined;
  const faixa: Faixa = fechada ?? (await margemDoMes(mes)).faixa ?? 10;
  const nome = (vendedor.data as { nome: string } | null)?.nome ?? "sem vendedor";
  return {
    titulo: textoAvisoVenda(v, faixa, contagem.count ?? 1),
    corpo: `${nome} · comissão a ${faixa}%${fechada ? " (fechamento do mês)" : " (faixa do mês até o fechamento)"}`,
    url: v.vendedor_id ? `/vendas?v=${v.vendedor_id}` : "/vendas",
  };
}

export async function lerVendaAviso(db: Db, vendaId: number): Promise<VendaAviso | null> {
  const { data, error } = await db.from("vendas").select(COLUNAS).eq("id", vendaId).maybeSingle<VendaAviso>();
  if (error) throw new Error(error.message);
  return data;
}

/** Chamado por processar.ts logo depois de criar a venda paga. Nunca derruba o evento. */
export async function avisarVenda(db: Db, vendaId: number): Promise<void> {
  try {
    const v = await lerVendaAviso(db, vendaId);
    if (!v || v.status !== "pago" || v.teste || v.aguardando_confirmacao) return;
    await avisarPessoas(db, "venda", `venda:${v.id}`, await montarAvisoVenda(db, v), await destinatarios(db, v.vendedor_id));
  } catch (e) {
    // a venda já está gravada: falha no push não faz a Hubla reenviar nem trava o evento
    console.error("[vendas] aviso de venda não saiu:", e instanceof Error ? e.message : e);
  }
}
