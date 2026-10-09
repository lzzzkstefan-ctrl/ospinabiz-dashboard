"use server";

// Ações da tela de Vendas (formato Lock in). Todas são só do admin: o vendedor só lê.
// Conferem o papel ANTES de gravar; vendas são gravadas com a chave secreta (o RLS não
// deixa ninguém gravar venda direto), o resto com o usuário logado (o RLS confere de novo).

import { ehAdmin, usuarioLogado } from "@/lib/auth/papeis";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { analisarCsv, resumirLI, slugDe, type LinhaImportacao, type Plataforma } from "@/modulos/vendas/lock-in";
import { FAIXAS, type Faixa, type StatusVenda } from "@/modulos/vendas/regras";
import { carregarVendas, listarTicketsLI } from "@/modulos/vendas/tela";
import { refresh } from "next/cache";
import { randomBytes, randomUUID } from "node:crypto";

export type Resultado = { erro?: string };
const SO_ADMIN: Resultado = { erro: "Só admin pode alterar." };
const mesOk = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const dataOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T12:00:00Z`).getTime());
const idOk = (n: number) => Number.isInteger(n) && n > 0;

/** Quem está mudando a venda: o banco exige isso em mês fechado e registra (vendas_alteracoes). */
const peloAdmin = (usuarioId: string) => ({ alterado_via: "admin" as const, alterado_por: usuarioId });

/** Erro do banco → mensagem para a tela. A trava de mês fechado já vem em português. */
function erroDoBanco(error: { message: string }, padrao: string): string {
  return /m[eê]s fechado|reabr/i.test(error.message) ? error.message : padrao;
}

async function vendedorExiste(id: number): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("vendedores").select("equipe_id").eq("equipe_id", id).maybeSingle();
  return !!data;
}

/** A plataforma existe (e, para venda nova, está ativa)? */
async function plataformaOk(slug: string, exigirAtiva: boolean): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("plataformas").select("ativa").eq("slug", slug).maybeSingle();
  return !!data && (!exigirAtiva || data.ativa);
}

// ---------- plataformas (Configuração de vendas, só admin) ----------
export async function criarPlataforma(nome: string, cor: string): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const n = nome.trim().replace(/\s+/g, " ");
  const slug = slugDe(n);
  if (!n || !slug) return { erro: "Digite o nome da plataforma." };
  if (!/^#[0-9a-f]{6}$/i.test(cor)) return { erro: "Cor inválida." };
  const supabase = await createClient();
  const { data: ultima } = await supabase.from("plataformas").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("plataformas").insert({ slug, nome: n, cor: cor.toLowerCase(), ordem: (ultima?.ordem ?? 0) + 1 });
  if (error) return { erro: error.code === "23505" ? "Já existe uma plataforma com esse nome." : "Não deu para salvar." };
  refresh();
  return {};
}

export async function editarPlataforma(slug: string, campos: { cor?: string; ativa?: boolean }): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  if (campos.cor !== undefined && !/^#[0-9a-f]{6}$/i.test(campos.cor)) return { erro: "Cor inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("plataformas")
    .update({ ...(campos.cor !== undefined ? { cor: campos.cor.toLowerCase() } : {}), ...(campos.ativa !== undefined ? { ativa: campos.ativa } : {}) })
    .eq("slug", slug);
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return {};
}

// ---------- mês do vendedor: observações e link público ----------
export async function salvarObservacoes(mes: string, vendedorId: number, texto: string): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  if (!mesOk(mes) || !idOk(vendedorId)) return { erro: "Mês ou vendedor inválido." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendas_meses_vendedor")
    .upsert({ mes: `${mes}-01`, vendedor_id: vendedorId, observacoes: texto.slice(0, 4000), atualizado_em: new Date().toISOString() });
  return error ? { erro: "Não deu para salvar as observações." } : {};
}

export async function gerarLinkMes(mes: string, vendedorId: number): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  if (!mesOk(mes) || !idOk(vendedorId)) return { erro: "Mês ou vendedor inválido." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendas_meses_vendedor")
    .upsert({ mes: `${mes}-01`, vendedor_id: vendedorId, codigo_publico: randomBytes(24).toString("base64url"), atualizado_em: new Date().toISOString() });
  if (error) return { erro: "Não deu para gerar o link." };
  refresh();
  return {};
}

export async function desativarLinkMes(mes: string, vendedorId: number): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendas_meses_vendedor")
    .update({ codigo_publico: null, atualizado_em: new Date().toISOString() })
    .eq("mes", `${mes}-01`)
    .eq("vendedor_id", vendedorId);
  if (error) return { erro: "Não deu para desativar." };
  refresh();
  return {};
}

// ---------- adiantamentos ----------
export async function criarAdiantamento(mes: string, vendedorId: number, valorCentavos: number, data: string): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  if (!mesOk(mes) || !idOk(vendedorId)) return { erro: "Mês ou vendedor inválido." };
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) return { erro: "Valor inválido." };
  if (!dataOk(data) || !data.startsWith(mes)) return { erro: "O dia tem que ser do mês do fechamento." };
  const supabase = await createClient();
  const { error } = await supabase.from("vendas_adiantamentos").insert({ vendedor_id: vendedorId, mes: `${mes}-01`, valor: valorCentavos / 100, data });
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return {};
}

export async function removerAdiantamento(id: number): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const supabase = await createClient();
  const { error } = await supabase.from("vendas_adiantamentos").delete().eq("id", id);
  if (error) return { erro: "Não deu para remover." };
  refresh();
  return {};
}

// ---------- WhatsApp do Rodrigo ----------
export async function salvarWhatsapp(numero: string): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  const digitos = numero.replace(/\D/g, "");
  if (digitos && !/^\d{10,15}$/.test(digitos)) return { erro: "Use DDI + DDD + número, só dígitos." };
  const supabase = await createClient();
  const { error } = await supabase.from("vendas_config").upsert({ id: true, whatsapp_fechamento: digitos || null, atualizado_em: new Date().toISOString() });
  return error ? { erro: "Não deu para salvar." } : {};
}

// ---------- "Enviar pro Rodrigo": grava o fechamento do mês no % escolhido pelo admin ----------
export async function registrarFechamento(mes: string, vendedorId: number, faixa: Faixa): Promise<Resultado> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  if (!mesOk(mes) || !idOk(vendedorId) || !FAIXAS.includes(faixa)) return { erro: "Dados inválidos." };
  const [a, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  const [vendas, tickets] = await Promise.all([carregarVendas(vendedorId, `${mes}-01`, fim), listarTicketsLI()]);
  const r = resumirLI(vendas, tickets);
  const semTicket = r.semTicket + r.semTicketProduto;
  const supabase = await createClient();
  const { error } = await supabase.from("vendas_fechamentos").insert({
    mes: `${mes}-01`,
    vendedor_id: vendedorId,
    faixa,
    qtd: r.qtd - semTicket,
    sem_ticket: semTicket,
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
    return { erro: "Não deu para gravar o fechamento." };
  }
  refresh();
  return {};
}

// ---------- vendas: nova, editar ----------
export type VendaInput = {
  vendedorId: number | null;
  nome: string;
  digitos: string;
  ticketId: number | null;
  principalProduto: boolean;
  status: StatusVenda;
  plataforma: Plataforma;
  data: string;
};

function validar(v: VendaInput): string | null {
  if (!v.nome.trim()) return "Digite o nome.";
  if (v.digitos && !/^\d{4}$/.test(v.digitos)) return "Os dígitos do telefone são 4 números.";
  if (!["pago", "reembolso", "chargeback"].includes(v.status)) return "Status inválido.";
  if (!dataOk(v.data)) return "Data inválida.";
  return null;
}

export async function criarVenda(v: VendaInput): Promise<Resultado> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const erro = validar(v);
  if (erro) return { erro };
  if (!(await plataformaOk(v.plataforma, true))) return { erro: "Plataforma inválida ou desativada." };
  if (!v.vendedorId || !(await vendedorExiste(v.vendedorId))) return { erro: "Escolha o vendedor." };
  const db = createAdminClient();
  const agora = new Date().toISOString();
  const { data, error } = await db
    .from("vendas")
    .insert({
      id_fatura: `manual-${randomUUID()}`,
      vendedor_id: v.vendedorId,
      forma_atribuicao: "manual",
      atribuida_por: usuario.id,
      atribuida_em: agora,
      ticket_id: v.ticketId,
      principal_produto: v.ticketId ? false : v.principalProduto,
      motivo_sem_ticket: v.ticketId ? null : v.principalProduto ? "produto sem comissão" : "sem ticket (venda manual)",
      itens: [],
      bumps: [],
      status: v.status,
      reembolsado_em: v.status === "pago" ? null : agora,
      data: v.data,
      final_lead: v.digitos || null,
      plataforma: v.plataforma,
      origem: "manual",
      ...peloAdmin(usuario.id),
    })
    .select("id")
    .single();
  if (error) return { erro: erroDoBanco(error, "Não deu para salvar a venda.") };
  await db.from("vendas_clientes").insert({ venda_id: data.id, nome: v.nome.trim().split(/\s+/)[0] });
  await db.from("vendas_atribuicoes").insert({ venda_id: data.id, para_vendedor_id: v.vendedorId, forma: "admin", por: usuario.id });
  refresh();
  return {};
}

/** Admin: ticket, status, data, dono e o nome/final do cliente de uma venda. */
export async function editarVenda(id: number, v: VendaInput & { semVendedor: boolean }): Promise<Resultado> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  if (!idOk(id)) return { erro: "Venda não encontrada." };
  const erro = validar(v);
  if (erro) return { erro };
  if (!(await plataformaOk(v.plataforma, false))) return { erro: "Plataforma inválida." };
  if (v.vendedorId && !(await vendedorExiste(v.vendedorId))) return { erro: "Vendedor inválido." };

  const db = createAdminClient();
  const { data: antes } = await db.from("vendas").select("vendedor_id, sem_vendedor, status, reembolsado_em").eq("id", id).single();
  if (!antes) return { erro: "Venda não encontrada." };
  const agora = new Date().toISOString();
  const mudouDono = antes.vendedor_id !== v.vendedorId || antes.sem_vendedor !== v.semVendedor;
  const { error } = await db
    .from("vendas")
    .update({
      ticket_id: v.ticketId,
      principal_produto: v.ticketId ? false : v.principalProduto,
      motivo_sem_ticket: v.ticketId ? null : v.principalProduto ? "produto sem comissão" : "sem ticket (definido pelo admin)",
      status: v.status,
      reembolsado_em: v.status === "pago" ? null : antes.status === v.status ? antes.reembolsado_em : agora,
      data: v.data,
      final_lead: v.digitos || null,
      plataforma: v.plataforma,
      ...(mudouDono
        ? {
            vendedor_id: v.semVendedor ? null : v.vendedorId,
            sem_vendedor: v.semVendedor,
            forma_atribuicao: v.vendedorId && !v.semVendedor ? "manual" : null,
            atribuida_por: usuario.id,
            atribuida_em: agora,
          }
        : {}),
      atualizado_em: agora,
      ...peloAdmin(usuario.id),
    })
    .eq("id", id);
  if (error) return { erro: erroDoBanco(error, "Não deu para salvar.") };
  await db.from("vendas_clientes").upsert({ venda_id: id, nome: v.nome.trim().split(/\s+/)[0] }, { onConflict: "venda_id" });
  if (mudouDono) {
    await db.from("vendas_atribuicoes").insert({
      venda_id: id,
      de_vendedor_id: antes.vendedor_id,
      para_vendedor_id: v.semVendedor ? null : v.vendedorId,
      sem_vendedor: v.semVendedor,
      forma: "admin",
      por: usuario.id,
    });
  }
  refresh();
  return {};
}

// ---------- importar CSV (formato do Notion do Lock in) ----------
export async function previaImportacao(texto: string): Promise<{ erro: string } | { linhas: LinhaImportacao[] }> {
  if (!(await ehAdmin())) return { erro: SO_ADMIN.erro! };
  if (texto.length > 2_000_000) return { erro: "Arquivo grande demais." };
  return analisarCsv(texto, await listarTicketsLI());
}

export async function gravarImportacao(texto: string, vendedorId: number): Promise<Resultado & { gravadas?: number }> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  if (!idOk(vendedorId) || !(await vendedorExiste(vendedorId))) return { erro: "Escolha o vendedor." };
  const r = analisarCsv(texto, await listarTicketsLI());
  if ("erro" in r) return r;
  const boas = r.linhas.filter((l) => !l.problemas.length);
  if (!boas.length) return { erro: "Nenhuma linha boa para gravar." };

  const db = createAdminClient();
  const agora = new Date().toISOString();
  let gravadas = 0;
  for (const l of boas) {
    const { data, error } = await db
      .from("vendas")
      .insert({
        id_fatura: `csv-${randomUUID()}`,
        vendedor_id: vendedorId,
        forma_atribuicao: "manual",
        atribuida_por: usuario.id,
        atribuida_em: agora,
        ticket_id: l.ticketId,
        itens: [],
        bumps: [],
        status: l.status,
        reembolsado_em: l.status === "pago" ? null : agora,
        data: l.data,
        final_lead: l.digitos || null,
        origem: "importacao",
        ...peloAdmin(usuario.id),
      })
      .select("id")
      .single();
    if (error) return { erro: `Parou na linha ${l.linha}: ${erroDoBanco(error, error.message)}`, gravadas };
    await db.from("vendas_clientes").insert({ venda_id: data.id, nome: l.nome });
    gravadas++;
  }
  refresh();
  return { gravadas };
}

// ---------- mês fechado: reabrir (com motivo) e ajuste manual ----------
/** Reabre um mês fechado. O banco confere se é admin, exige o motivo e registra. */
export async function reabrirMes(mes: string, vendedorId: number, motivo: string): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  if (!mesOk(mes) || !idOk(vendedorId)) return { erro: "Mês ou vendedor inválido." };
  if (motivo.trim().length < 5) return { erro: "Escreva o motivo (mínimo 5 letras)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("vendas_reabrir_mes", { p_mes: `${mes}-01`, p_vendedor: vendedorId, p_motivo: motivo.trim().slice(0, 500) });
  if (error) return { erro: error.message || "Não deu para reabrir." };
  refresh();
  return {};
}

/** Ajuste manual num mês fechado: + paga a mais, − desconta. Não se apaga: corrige-se com outro. */
export async function criarAjuste(mes: string, vendedorId: number, valorCentavos: number, motivo: string): Promise<Resultado> {
  if (!(await ehAdmin())) return SO_ADMIN;
  if (!mesOk(mes) || !idOk(vendedorId)) return { erro: "Mês ou vendedor inválido." };
  if (!Number.isInteger(valorCentavos) || valorCentavos === 0) return { erro: "Valor inválido." };
  const m = motivo.trim();
  if (m.length < 5) return { erro: "Escreva o motivo (mínimo 5 letras)." };
  const supabase = await createClient();
  const { error } = await supabase.from("vendas_ajustes").insert({ mes: `${mes}-01`, vendedor_id: vendedorId, valor: valorCentavos / 100, motivo: m.slice(0, 500) });
  if (error) return { erro: /m[eê]s fechado|m[eê]s aberto/i.test(error.message) ? error.message : "Não deu para salvar o ajuste." };
  refresh();
  return {};
}
