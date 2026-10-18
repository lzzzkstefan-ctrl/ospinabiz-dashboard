// Push de venda paga (18/10/2026): "💰 Venda R$ 48,90 · Protocolo Viral · Davi · comissão R$ 4,48".
// Sai uma vez por venda criada pelo webhook da Hubla (chave venda:<id> em notificacoes_enviadas),
// para os admins, os chefes de Vendas e o vendedor dono (os mesmos do aviso de reembolso).
// Comissão na faixa do fechamento do mês; sem fechamento, a sugerida pela margem; sem ela, 10%
// (o mesmo padrão da tela). GCS: a cópia guardada na venda; Viral: líquido × % (comissaoDe).

import { avisarPessoas } from "@/lib/notificacoes";
import type { createAdminClient } from "@/lib/supabase/admin";
import { margemDoMes } from "./dados";
import { destinatarios } from "./reembolsos";
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
  viral_liquido: number | string | null;
} & Record<`snap_comissao_${Faixa}`, number | string | null>;

/** Comissão da venda (centavos) na faixa; null = ainda sem base (Viral sem líquido, GCS sem ticket). */
export function comissaoDaVenda(v: VendaAviso, faixa: Faixa): number | null {
  if (v.linha === "viral") return v.viral_liquido == null ? null : comissaoDe(centavos(v.viral_liquido), faixa);
  const c = v[`snap_comissao_${faixa}`];
  return v.ticket_id === null || c == null ? null : centavos(c);
}

/** "💰 Venda R$ 48,90 · Protocolo Viral · Davi · comissão R$ 4,48" */
export function textoAvisoVenda(v: VendaAviso, vendedor: string | null, faixa: Faixa): string {
  const valor = v.valor_pago ?? v.snap_bruto;
  const produto = v.linha === "viral" ? "Protocolo Viral" : "Protocolo Game Changer";
  const comissao = comissaoDaVenda(v, faixa);
  return [
    `💰 Venda ${valor == null ? "sem valor" : reais(centavos(valor))}`,
    produto,
    vendedor ?? "sem vendedor",
    comissao === null ? "comissão a definir" : `comissão ${reais(comissao)}`,
  ].join(" · ");
}

/** Chamado por processar.ts logo depois de criar a venda paga. Nunca derruba o evento. */
export async function avisarVenda(db: Db, vendaId: number): Promise<void> {
  try {
    const { data: v, error } = await db
      .from("vendas")
      .select(
        "id, status, teste, aguardando_confirmacao, vendedor_id, linha, ticket_id, data, valor_pago, snap_bruto, viral_liquido, snap_comissao_6, snap_comissao_7, snap_comissao_8, snap_comissao_9, snap_comissao_10",
      )
      .eq("id", vendaId)
      .maybeSingle<VendaAviso>();
    if (error) throw new Error(error.message);
    if (!v || v.status !== "pago" || v.teste || v.aguardando_confirmacao) return;

    const mes = v.data.slice(0, 7);
    const [vendedor, fechamento] = await Promise.all([
      v.vendedor_id ? db.from("equipe").select("nome").eq("id", v.vendedor_id).maybeSingle() : Promise.resolve({ data: null }),
      v.vendedor_id
        ? db.from("vendas_fechamentos").select("faixa").eq("mes", `${mes}-01`).eq("vendedor_id", v.vendedor_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const fechada = (fechamento.data as { faixa: number } | null)?.faixa as Faixa | undefined;
    const faixa: Faixa = fechada ?? (await margemDoMes(mes)).faixa ?? 10;
    const nome = (vendedor.data as { nome: string } | null)?.nome ?? null;

    await avisarPessoas(
      db,
      "venda",
      `venda:${v.id}`,
      {
        titulo: textoAvisoVenda(v, nome, faixa),
        corpo: fechada ? `Comissão a ${faixa}% (fechamento do mês).` : `Comissão a ${faixa}% (faixa do mês até o fechamento).`,
        url: v.vendedor_id ? `/vendas?v=${v.vendedor_id}` : "/vendas",
      },
      await destinatarios(db, v.vendedor_id),
    );
  } catch (e) {
    // a venda já está gravada: falha no push não faz a Hubla reenviar nem trava o evento
    console.error("[vendas] aviso de venda não saiu:", e instanceof Error ? e.message : e);
  }
}
