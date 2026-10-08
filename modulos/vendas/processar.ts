// Processa um evento da Hubla já gravado em hubla_eventos. Pode rodar mais de
// uma vez para o mesmo evento (reprocessar) sem duplicar nada:
// - pagamento: cria a venda (uma por fatura), atribui pelo utm_term e grava os
//   dados do cliente à parte; se já havia reembolso dessa fatura, nasce "reembolso";
// - reembolso: marca a venda; se ela ainda não existe, o evento fica registrado
//   e a venda já nasce reembolsada quando o pagamento chegar.
// Usa a chave secreta (roda no servidor, depois da resposta à Hubla).

import { createAdminClient } from "@/lib/supabase/admin";
import { lerFatura, type FaturaHubla } from "./hubla";
import { diaSP, finalDoLead, ticketDosItens, vendedorDoUtm, type Ticket } from "./regras";

type Db = ReturnType<typeof createAdminClient>;
type Conclusao = { resultado: string; vendaId?: number | null };

export async function processarEvento(eventoId: number): Promise<void> {
  const db = createAdminClient();

  const { data: evento, error } = await db
    .from("hubla_eventos")
    .select("id, payload, tentativas")
    .eq("id", eventoId)
    .single();
  if (error || !evento) return;

  await db.from("hubla_eventos").update({ tentativas: evento.tentativas + 1 }).eq("id", eventoId);

  try {
    const fatura = lerFatura(evento.payload);
    const fim = await decidir(db, eventoId, fatura);
    await db
      .from("hubla_eventos")
      .update({
        processado: true,
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

async function decidir(db: Db, eventoId: number, f: FaturaHubla): Promise<Conclusao> {
  if (f.tipo === "outro") return { resultado: "ignorado" };
  if (!f.idFatura) throw new Error("evento sem id da fatura");
  return f.tipo === "reembolso" ? reembolso(db, f.idFatura) : pagamento(db, eventoId, f);
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
    .update({ status: "reembolso", reembolsado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
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

  const [vendedores, tickets, reembolsoAntes] = await Promise.all([
    db.from("vendedores").select("equipe_id, utm_term, ativo"),
    db.from("tickets").select("*"),
    db
      .from("hubla_eventos")
      .select("id, recebido_em")
      .eq("id_fatura", idFatura)
      .eq("resultado", "reembolso_antes_da_venda")
      .neq("id", eventoId)
      .limit(1),
  ]);
  if (vendedores.error) throw new Error(`erro ao ler vendedores: ${vendedores.error.message}`);
  if (tickets.error) throw new Error(`erro ao ler tickets: ${tickets.error.message}`);
  if (reembolsoAntes.error) throw new Error(`erro ao ler eventos: ${reembolsoAntes.error.message}`);

  const vendedorId = vendedorDoUtm(f.utmTerm, vendedores.data);
  const ticket = ticketDosItens(f.itens, tickets.data as Ticket[]);
  const jaReembolsada = reembolsoAntes.data.length > 0;
  const agora = new Date().toISOString();

  const { data: venda, error } = await db
    .from("vendas")
    .insert({
      id_fatura: idFatura,
      vendedor_id: vendedorId,
      forma_atribuicao: vendedorId ? "utm" : null,
      atribuida_em: vendedorId ? agora : null,
      utm_term: f.utmTerm,
      ticket_id: ticket.ticketId,
      motivo_sem_ticket: ticket.motivo,
      itens: f.itens,
      bumps: ticket.bumps,
      valor_pago: f.valorPagoCentavos === null ? null : f.valorPagoCentavos / 100,
      status: jaReembolsada ? "reembolso" : "pago",
      reembolsado_em: jaReembolsada ? reembolsoAntes.data[0].recebido_em : null,
      pago_em: f.pagoEm,
      data: (f.pagoEm && diaSP(f.pagoEm)) ?? diaSP(new Date())!,
      final_lead: finalDoLead(f.utmContent, f.telefone),
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
      .insert({ venda_id: venda.id, para_vendedor_id: vendedorId, forma: "utm" });
    if (erroHist) throw new Error(`erro ao gravar o histórico: ${erroHist.message}`);
  }
  return { resultado: jaReembolsada ? "venda_criada_ja_reembolsada" : "venda_criada", vendaId: venda.id };
}

async function gravarCliente(db: Db, vendaId: number, f: FaturaHubla): Promise<void> {
  const { error } = await db
    .from("vendas_clientes")
    .upsert({ venda_id: vendaId, nome: f.nome, telefone: f.telefone, email: f.email }, { onConflict: "venda_id" });
  if (error) throw new Error(`erro ao gravar o cliente: ${error.message}`);
}
