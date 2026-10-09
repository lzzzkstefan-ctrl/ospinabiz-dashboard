"use server";

// Ações do módulo Vendas. Toda ação confere quem está pedindo ANTES de gravar:
// atribuição, correções de venda, fechamento do mês, tickets, custos, valores do mês
// e reprocessar: só admin. O vendedor só lê (e só o que é dele, pelo RLS).
// Vendas são gravadas com a chave secreta (o RLS não deixa ninguém gravar direto).

import type { EstadoForm } from "@/components/formulario";
import { ehAdmin, usuarioLogado } from "@/lib/auth/papeis";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dadosDoFechamento } from "@/modulos/vendas/fechamento";
import { processarEvento } from "@/modulos/vendas/processar";
import { FAIXAS, type Faixa } from "@/modulos/vendas/regras";
import { refresh } from "next/cache";

const SO_ADMIN: EstadoForm = { erro: "Só admin pode alterar." };

/** Quem está mudando a venda: o banco exige isso em mês fechado e registra (vendas_alteracoes). */
const peloAdmin = (usuarioId: string) => ({ alterado_via: "admin" as const, alterado_por: usuarioId });

/** Erro do banco → mensagem para a tela. A trava de mês fechado já vem em português. */
function erroDoBanco(error: { message: string }, padrao: string): string {
  return /m[eê]s fechado|reabr/i.test(error.message) ? error.message : padrao;
}

function id(form: FormData, campo = "id"): number | null {
  const n = Number(form.get(campo));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** "1.234,56" ou "1234.56" → 1234.56; vazio → null; inválido → NaN. */
function valorEmReais(form: FormData, campo: string): number | null {
  const bruto = String(form.get(campo) ?? "").trim();
  if (!bruto) return null;
  const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

function mesDoForm(form: FormData): string | null {
  const mes = String(form.get("mes") ?? "");
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? `${mes}-01` : null;
}

// ---------------------------------------------------------------------------
// Atribuição
// ---------------------------------------------------------------------------
/** Admin: muda o dono. destino = "<equipe_id>", "a_atribuir" ou "ninguem" (não é de nenhum vendedor). */
export async function atribuirVenda(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const vendaId = id(form);
  if (!vendaId) return { erro: "Venda não encontrada." };

  const destino = String(form.get("destino") ?? "");
  const paraId = /^\d+$/.test(destino) ? Number(destino) : null;
  const semVendedor = destino === "ninguem";
  if (!paraId && destino !== "a_atribuir" && !semVendedor) return { erro: "Escolha para quem vai a venda." };

  const db = createAdminClient();
  const { data: antes } = await db.from("vendas").select("vendedor_id").eq("id", vendaId).single();
  const agora = new Date().toISOString();
  const { error } = await db
    .from("vendas")
    .update({
      vendedor_id: paraId,
      sem_vendedor: semVendedor,
      forma_atribuicao: paraId ? "manual" : null,
      atribuida_por: paraId || semVendedor ? usuario.id : null,
      atribuida_em: paraId || semVendedor ? agora : null,
      atualizado_em: agora,
      ...peloAdmin(usuario.id),
    })
    .eq("id", vendaId);
  if (error) return { erro: erroDoBanco(error, "Não deu para salvar.") };

  await db.from("vendas_atribuicoes").insert({
    venda_id: vendaId,
    de_vendedor_id: antes?.vendedor_id ?? null,
    para_vendedor_id: paraId,
    sem_vendedor: semVendedor,
    forma: "admin",
    por: usuario.id,
  });
  refresh();
  return { ok: "Salvo." };
}

/** Admin: corrige o ticket e o status (pago, reembolso, chargeback) de uma venda. */
export async function corrigirVenda(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const vendaId = id(form);
  if (!vendaId) return { erro: "Venda não encontrada." };

  const ticketTexto = String(form.get("ticket_id") ?? "");
  const ticketId = ticketTexto ? Number(ticketTexto) : null;
  const status = String(form.get("status") ?? "");
  if (!["pago", "reembolso", "chargeback"].includes(status)) return { erro: "Status inválido." };

  const db = createAdminClient();
  const { data: antes } = await db.from("vendas").select("status, reembolsado_em").eq("id", vendaId).single();
  const { error } = await db
    .from("vendas")
    .update({
      ticket_id: ticketId,
      motivo_sem_ticket: ticketId ? null : "sem ticket (definido pelo admin)",
      status,
      reembolsado_em: status === "pago" ? null : (antes?.status === status ? antes.reembolsado_em : new Date().toISOString()),
      atualizado_em: new Date().toISOString(),
      ...peloAdmin(usuario.id),
    })
    .eq("id", vendaId);
  if (error) return { erro: erroDoBanco(error, "Não deu para salvar.") };
  refresh();
  return { ok: "Salvo." };
}

// ---------------------------------------------------------------------------
// Fechamento do mês por vendedor (só admin): grava o % escolhido e congela os totais.
// Mês já fechado não se fecha de novo: reabra (com motivo) ou use um ajuste.
// ---------------------------------------------------------------------------
export async function fecharMes(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const mes = mesDoForm(form);
  const vendedorId = id(form, "vendedor_id");
  const faixa = Number(form.get("faixa")) as Faixa;
  if (!mes || !vendedorId) return { erro: "Mês ou vendedor inválido." };
  if (!FAIXAS.includes(faixa)) return { erro: "Escolha o % (6 a 10)." };

  const d = await dadosDoFechamento(mes.slice(0, 7), vendedorId);
  const r = d.resumo;
  const supabase = await createClient();
  const { error } = await supabase.from("vendas_fechamentos").insert({
    mes,
    vendedor_id: vendedorId,
    faixa,
    faixa_sugerida: d.faixaSugerida,
    qtd: r.qtd,
    sem_ticket: r.semTicket,
    bruto: r.bruto / 100,
    liquido: r.liquido / 100,
    comissao: r.comissao[faixa] / 100,
    reembolsos: r.reembolsos,
    chargebacks: r.chargebacks,
    fechado_em: new Date().toISOString(),
    fechado_por: usuario.id,
  });
  if (error) {
    if (error.code === "23505") return { erro: "Este mês já está fechado. Para fechar de novo, reabra (com motivo) ou use um ajuste." };
    return { erro: "Não deu para salvar." };
  }
  refresh();
  return { ok: `Mês fechado em ${faixa}%.` };
}

// ---------------------------------------------------------------------------
// Configuração (só admin; o RLS do banco confere de novo)
// ---------------------------------------------------------------------------
export async function salvarMes(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const mes = mesDoForm(form);
  if (!mes) return { erro: "Mês inválido." };

  const gasto = valorEmReais(form, "gasto_anuncios");
  const imposto = valorEmReais(form, "imposto_meta");
  const mensagens = valorEmReais(form, "custo_mensagens");
  if ([gasto, imposto, mensagens].some((v) => Number.isNaN(v))) return { erro: "Use valores em reais, ex.: 1.234,56" };

  const supabase = await createClient();
  const { error } = await supabase.from("vendas_meses").upsert({
    mes,
    gasto_anuncios: gasto,
    imposto_meta: imposto,
    custo_mensagens: mensagens,
    atualizado_em: new Date().toISOString(),
    atualizado_por: usuario.id,
  });
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return { ok: "Salvo." };
}

export async function salvarTicket(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const campos = ["valor_bruto", "valor_liquido", "comissao_6", "comissao_7", "comissao_8", "comissao_9", "comissao_10"] as const;
  const valores = Object.fromEntries(campos.map((c) => [c, valorEmReais(form, c)]));
  if (Object.values(valores).some((v) => v === null || Number.isNaN(v))) return { erro: "Preencha todos os valores em reais." };
  if ((valores.valor_bruto as number) <= 0) return { erro: "Valor bruto tem que ser maior que zero." };

  const supabase = await createClient();
  const ticketId = id(form);
  const { error } = ticketId
    ? await supabase.from("tickets").update(valores).eq("id", ticketId)
    : await supabase.from("tickets").insert(valores);
  if (error) return { erro: error.code === "23505" ? "Já existe um ticket com esse valor bruto." : "Não deu para salvar." };
  refresh();
  return { ok: ticketId ? "Salvo." : "Ticket cadastrado." };
}

export async function alternarTicket(form: FormData): Promise<void> {
  if (!(await ehAdmin())) return;
  const ticketId = id(form);
  if (!ticketId) return;
  const supabase = await createClient();
  await supabase.from("tickets").update({ ativo: form.get("ativo") === "true" }).eq("id", ticketId);
  refresh();
}

/** Novo custo fixo, já com o valor a partir do mês escolhido. */
export async function criarCusto(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const nome = String(form.get("nome") ?? "").trim().slice(0, 60);
  const mes = mesDoForm(form);
  const valor = valorEmReais(form, "valor");
  if (!nome) return { erro: "Digite o nome do custo." };
  if (!mes) return { erro: "Mês inválido." };
  if (Number.isNaN(valor)) return { erro: "Use valores em reais, ex.: 79,90" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("custos_fixos").insert({ nome }).select("id").single();
  if (error) return { erro: error.code === "23505" ? "Já existe um custo com esse nome." : "Não deu para salvar." };
  await supabase.from("custos_fixos_valores").insert({ custo_id: data.id, vigente_desde: mes, valor });
  refresh();
  return { ok: `${nome} cadastrado.` };
}

/** Valor de um custo a partir de um mês (os meses anteriores não mudam). */
export async function valorDoCusto(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const custoId = id(form);
  const mes = mesDoForm(form);
  const valor = valorEmReais(form, "valor");
  if (!custoId || !mes) return { erro: "Custo ou mês inválido." };
  if (Number.isNaN(valor)) return { erro: "Use valores em reais, ex.: 79,90" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("custos_fixos_valores")
    .upsert({ custo_id: custoId, vigente_desde: mes, valor }, { onConflict: "custo_id,vigente_desde" });
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return { ok: "Salvo." };
}

/** Desativa um custo a partir de um mês (ou reativa, sem mês). */
export async function alternarCusto(form: FormData): Promise<void> {
  if (!(await ehAdmin())) return;
  const custoId = id(form);
  if (!custoId) return;
  const desativar = form.get("acao") === "desativar";
  const mes = mesDoForm(form);
  if (desativar && !mes) return;
  const supabase = await createClient();
  await supabase.from("custos_fixos").update({ desativado_desde: desativar ? mes : null }).eq("id", custoId);
  refresh();
}

export async function reprocessar(form: FormData): Promise<void> {
  if (!(await ehAdmin())) return;
  const eventoId = id(form);
  if (eventoId) await processarEvento(eventoId);
  refresh();
}

export async function reprocessarTodos(): Promise<void> {
  if (!(await ehAdmin())) return;
  const db = createAdminClient();
  const { data } = await db
    .from("hubla_eventos")
    .select("id")
    .or("erro.not.is.null,processado.eq.false")
    .order("recebido_em")
    .limit(100);
  for (const e of data ?? []) await processarEvento(e.id);
  refresh();
}
