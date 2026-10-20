// Processa um evento da Hubla já gravado em hubla_eventos. Pode rodar mais de
// uma vez para o mesmo evento (reprocessar) sem duplicar nada:
// - pagamento: cria a venda (uma por fatura), atribui pelo utm_term e grava os
//   dados do cliente à parte; se já havia reembolso dessa fatura, nasce "reembolso";
// - reembolso: marca a venda; se ela ainda não existe, o evento fica registrado
//   e a venda já nasce reembolsada quando o pagamento chegar.
// Usa a chave secreta (roda no servidor, depois da resposta à Hubla).
// Toda gravação em vendas vai com alterado_via = 'hubla': em mês fechado o banco aceita só
// reembolso/chargeback e venda nova, registra em vendas_alteracoes e gera o estorno.
// Protocolo Viral (16/10/2026): produto ou oferta com ID em vendas_produtos_hubla → linha 'viral',
// sem ticket, valor = total pago na fatura; a comissão do Viral o banco calcula ao gravar.
// Pedido de reembolso (16/10/2026): refund_request.created/.canceled/.rejected vão para
// vendas_reembolsos (reembolsos.ts, com push); aceito/reembolsado também fecha o pedido aberto.
// Venda nova paga (18/10/2026): push "💰 Venda R$ … · produto · vendedor · comissão R$ …" (aviso-venda.ts).
// Sem utm_term (20/10/2026): sem código, vazio ou desconhecido → vendas_config.dono_sem_utm (o Rodrigo,
// sem comissão e sem push); forma 'sem_utm'.

import { createAdminClient } from "@/lib/supabase/admin";
import { lerFatura, type FaturaHubla } from "./hubla";
import { avisarVenda } from "./aviso-venda";
import { pedidoEfetuado, processarPedido } from "./reembolsos";
import { diaSP, donoDaVenda, finalDoLead, montarVendaNova, type IdHubla, type Ticket } from "./regras";

type Db = ReturnType<typeof createAdminClient>;
type Conclusao = { resultado: string; vendaId?: number | null };

export async function processarEvento(eventoId: number): Promise<void> {
  const db = createAdminClient();

  const { data: evento, error } = await db
    .from("hubla_eventos")
    .select("id, payload, tentativas, recebido_em")
    .eq("id", eventoId)
    .single();
  if (error || !evento) return;

  await db.from("hubla_eventos").update({ tentativas: evento.tentativas + 1 }).eq("id", eventoId);

  try {
    const fatura = lerFatura(evento.payload);
    const fim = await decidir(db, eventoId, fatura, evento.recebido_em);
    await db
      .from("hubla_eventos")
      .update({
        processado: true,
        // a Edge Function grava só o bruto: tipo e fatura são preenchidos aqui
        tipo: fatura.tipoBruto,
        id_fatura: fatura.idFatura,
        resultado: fim.resultado,
        erro: null,
        venda_id: fim.vendaId ?? null,
        processado_em: new Date().toISOString(),
      })
      .eq("id", eventoId);
  } catch (e) {
    await db
      .from("hubla_eventos")
      .update({ processado: false, erro: e instanceof Error ? e.message : String(e), processado_em: new Date().toISOString() })
      .eq("id", eventoId);
  }
}

async function decidir(db: Db, eventoId: number, f: FaturaHubla, recebidoEm: string): Promise<Conclusao> {
  if (f.tipo === "outro") return { resultado: "ignorado" };
  if (!f.idFatura) throw new Error("evento sem id da fatura");
  if (f.tipo === "pedido_reembolso" || f.tipo === "pedido_reembolso_fim") return processarPedido(db, f, recebidoEm);
  if (f.tipo === "reembolso") {
    const fim = await reembolso(db, f.idFatura);
    await pedidoEfetuado(db, f, recebidoEm);
    return fim;
  }
  return pagamento(db, eventoId, f);
}

async function reembolso(db: Db, idFatura: string): Promise<Conclusao> {
  const { data, error } = await db
    .from("vendas")
    .select("id, status")
    .eq("id_fatura", idFatura)
    .maybeSingle();
  if (error) throw new Error(`erro ao buscar a venda: ${error.message}`);
  if (!data) return { resultado: "reembolso_antes_da_venda" };
  if (data.status !== "pago") return { resultado: "repetido", vendaId: data.id };

  const { error: erroUpdate } = await db
    .from("vendas")
    .update({ status: "reembolso", reembolsado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), alterado_via: "hubla" })
    .eq("id", data.id);
  if (erroUpdate) throw new Error(`erro ao marcar reembolso: ${erroUpdate.message}`);
  return { resultado: "reembolso", vendaId: data.id };
}

async function pagamento(db: Db, eventoId: number, f: FaturaHubla): Promise<Conclusao> {
  const idFatura = f.idFatura!;

  const existente = await db.from("vendas").select("id").eq("id_fatura", idFatura).maybeSingle();
  if (existente.error) throw new Error(`erro ao buscar a venda: ${existente.error.message}`);
  if (existente.data) {
    await gravarCliente(db, existente.data.id, f); // completa se uma tentativa anterior parou no meio
    return { resultado: "repetido", vendaId: existente.data.id };
  }

  const [vendedores, tickets, idsViral, reembolsoAntes, config] = await Promise.all([
    db.from("vendedores").select("equipe_id, utm_term, ativo"),
    db.from("tickets").select("*"),
    db.from("vendas_produtos_hubla").select("hubla_id, tipo").eq("ativo", true),
    db
      .from("hubla_eventos")
      .select("id, recebido_em")
      .eq("id_fatura", idFatura)
      .eq("resultado", "reembolso_antes_da_venda")
      .neq("id", eventoId)
      .limit(1),
    db.from("vendas_config").select("dono_sem_utm").maybeSingle(),
  ]);
  if (vendedores.error) throw new Error(`erro ao ler vendedores: ${vendedores.error.message}`);
  if (tickets.error) throw new Error(`erro ao ler tickets: ${tickets.error.message}`);
  if (idsViral.error) throw new Error(`erro ao ler os IDs do Viral: ${idsViral.error.message}`);
  if (reembolsoAntes.error) throw new Error(`erro ao ler eventos: ${reembolsoAntes.error.message}`);
  if (config.error) throw new Error(`erro ao ler a configuração: ${config.error.message}`);

  const dono = donoDaVenda(f.utmTerm, vendedores.data, config.data?.dono_sem_utm == null ? null : Number(config.data.dono_sem_utm));
  const vendedorId = dono?.vendedorId ?? null;
  const produto = montarVendaNova(f, tickets.data as Ticket[], idsViral.data as IdHubla[]);
  const jaReembolsada = reembolsoAntes.data.length > 0;
  const agora = new Date().toISOString();

  const { data: venda, error } = await db
    .from("vendas")
    .insert({
      id_fatura: idFatura,
      vendedor_id: vendedorId,
      forma_atribuicao: dono?.forma ?? null,
      atribuida_em: vendedorId ? agora : null,
      utm_term: f.utmTerm,
      ...produto,
      receita_liquida: f.receitaLiquidaCentavos === null ? null : f.receitaLiquidaCentavos / 100,
      status: jaReembolsada ? "reembolso" : "pago",
      reembolsado_em: jaReembolsada ? reembolsoAntes.data[0].recebido_em : null,
      pago_em: f.pagoEm,
      data: (f.pagoEm && diaSP(f.pagoEm)) ?? diaSP(new Date())!,
      final_lead: finalDoLead(f.utmContent, f.telefone),
      alterado_via: "hubla",
    })
    .select("id")
    .single();

  if (error) {
    // duas entregas da mesma fatura ao mesmo tempo: a segunda bate na trava do banco
    if (error.code === "23505") {
      const outra = await db.from("vendas").select("id").eq("id_fatura", idFatura).maybeSingle();
      return { resultado: "repetido", vendaId: outra.data?.id ?? null };
    }
    throw new Error(`erro ao criar a venda: ${error.message}`);
  }

  await gravarCliente(db, venda.id, f);
  if (vendedorId) {
    const { error: erroHist } = await db
      .from("vendas_atribuicoes")
      .insert({ venda_id: venda.id, para_vendedor_id: vendedorId, forma: dono!.forma });
    if (erroHist) throw new Error(`erro ao gravar o histórico: ${erroHist.message}`);
  }
  if (!jaReembolsada) await avisarVenda(db, venda.id);
  return { resultado: jaReembolsada ? "venda_criada_ja_reembolsada" : "venda_criada", vendaId: venda.id };
}

async function gravarCliente(db: Db, vendaId: number, f: FaturaHubla): Promise<void> {
  const { error } = await db
    .from("vendas_clientes")
    .upsert({ venda_id: vendaId, nome: f.nome, telefone: f.telefone, email: f.email }, { onConflict: "venda_id" });
  if (error) throw new Error(`erro ao gravar o cliente: ${error.message}`);
}
