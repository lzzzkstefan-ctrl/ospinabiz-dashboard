// Vendas: liga a regra "líquido de ticket pela fatura real" a partir de um mês e recalcula as
// vendas desse mês em diante (migration vendas_liquido_real). Decisão do Davi, 09/10/2026.
//   líquido de ticket = receita_liquida × (preço do ticket ÷ subtotal da fatura)
//   comissão = % × esse líquido (meio centavo para cima). Bruto de ticket = preço da tabela.
// Meses anteriores ficam como estão. Mês FECHADO não é tocado (a comissão congelada não muda):
// o script pula e avisa.
//
// O subtotal da fatura (valor_pago) vem do banco (webhook) ou do export da Hubla ("Valor do
// produto"); a receita (receita_liquida) do banco, ou do evento do webhook se ainda faltar.
// Gravar o subtotal/receita é o que dispara o recálculo no banco (gatilho vendas_snapshot_ticket).
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/vendas-liquido-real.mjs --desde=2026-10 --arquivo=importar/ospina.xlsx            # prévia
//   node --env-file=.env.local scripts/vendas-liquido-real.mjs --desde=2026-10 --arquivo=importar/ospina.xlsx --aplicar  # grava

import { createClient } from "@supabase/supabase-js";
import { lerPlanilha, semAcento } from "./vendas-planilha-hubla.mjs";

const aplicar = process.argv.includes("--aplicar");
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const desde = arg("desde");
const arquivo = arg("arquivo");
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(desde ?? "")) {
  console.error("Informe --desde=AAAA-MM (o primeiro mês ainda não pago).");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const cent = (v) => (v == null || v === "" ? null : Math.round(Number(String(v).replace(",", ".")) * 100));
const comissao = (liq, pct) => Math.floor((liq * pct + 50) / 100);
const brl = (c) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

try {
  // subtotal do export (id da fatura → centavos)
  const subtotalDoExport = new Map();
  if (arquivo) {
    const [cab, ...corpo] = lerPlanilha(arquivo).linhas;
    const iId = cab.findIndex((h) => semAcento(h) === semAcento("ID da fatura"));
    const iProd = cab.findIndex((h) => semAcento(h) === semAcento("Valor do produto"));
    if (iId < 0 || iProd < 0) throw new Error('o export precisa das colunas "ID da fatura" e "Valor do produto"');
    for (const l of corpo) subtotalDoExport.set(String(l[iId]).trim(), cent(l[iProd]));
  }
  // receita dos eventos do webhook (para venda que ainda não tem receita gravada)
  const receitaDoWebhook = new Map();
  const { data: eventos } = await db.from("hubla_eventos").select("id_fatura, payload").eq("tipo", "invoice.payment_succeeded");
  for (const e of eventos ?? []) {
    const inv = e.payload?.event?.invoice ?? {};
    const r = (inv.receivers ?? []).find((x) => x?.id && x.id === inv.sellerId);
    if (e.id_fatura && typeof r?.totalCents === "number") receitaDoWebhook.set(e.id_fatura, r.totalCents);
  }

  const { data: vendas, error } = await db
    .from("vendas")
    .select("id, id_fatura, data, vendedor_id, status, ticket_id, teste, snap_bruto, snap_liquido, receita_liquida, valor_pago, tickets(valor_bruto)")
    .gte("data", `${desde}-01`)
    .not("ticket_id", "is", null)
    .order("data");
  if (error) throw new Error(error.message);
  const { data: fechs } = await db.from("vendas_fechamentos").select("mes, vendedor_id");
  const fechado = new Set(fechs.map((f) => `${f.mes.slice(0, 7)}|${f.vendedor_id}`));
  const { data: equipe } = await db.from("equipe").select("id, nome");
  const nome = new Map(equipe.map((p) => [p.id, p.nome]));

  const grupos = new Map();
  const mudar = [];
  let semDados = 0;
  const pulasFechado = [];
  for (const v of vendas) {
    const receita = cent(v.receita_liquida) ?? receitaDoWebhook.get(v.id_fatura) ?? null;
    const subtotal = cent(v.valor_pago) ?? subtotalDoExport.get(v.id_fatura) ?? null;
    const ticket = cent(v.tickets.valor_bruto);
    const antes = cent(v.snap_liquido);
    const depois = receita != null && subtotal ? Math.round((receita * ticket) / subtotal) : antes;
    if (receita == null || !subtotal) semDados++;
    const mes = v.data.slice(0, 7);
    const ehFechado = v.vendedor_id && fechado.has(`${mes}|${v.vendedor_id}`);
    const k = `${mes} · ${v.vendedor_id ? nome.get(v.vendedor_id) : "sem vendedor"}${ehFechado ? " (fechado)" : ""}`;
    const g = grupos.get(k) ?? { n: 0, liqAntes: 0, liqDepois: 0, c10Antes: 0, c10Depois: 0, c6Antes: 0, c6Depois: 0 };
    if (v.status === "pago" && !v.teste) {
      g.n++;
      g.liqAntes += antes; g.liqDepois += depois;
      g.c10Antes += comissao(antes, 10); g.c10Depois += comissao(depois, 10);
      g.c6Antes += comissao(antes, 6); g.c6Depois += comissao(depois, 6);
    }
    grupos.set(k, g);
    if (depois !== antes) {
      if (ehFechado) pulasFechado.push(v.id);
      else mudar.push({ v, receita, subtotal });
    }
  }

  console.log(`LÍQUIDO DE TICKET PELA FATURA — ${aplicar ? "APLICANDO" : "PRÉVIA (nada gravado)"} — a partir de ${desde}`);
  console.log(`vendas com ticket no período: ${vendas.length} · mudam: ${mudar.length + pulasFechado.length} · em mês fechado (não mexo): ${pulasFechado.length} · sem dados da fatura (ficam pela tabela): ${semDados}\n`);
  console.log("Mês · vendedor              Pagas   Líquido antes → depois         Comissão 10% antes → depois   Comissão 6% antes → depois");
  for (const [k, g] of [...grupos].sort()) {
    console.log(
      `${k.padEnd(28)} ${String(g.n).padStart(5)}   ${brl(g.liqAntes).padStart(11)} → ${brl(g.liqDepois).padStart(11)}   ${brl(g.c10Antes).padStart(11)} → ${brl(g.c10Depois).padStart(11)}   ${brl(g.c6Antes).padStart(10)} → ${brl(g.c6Depois).padStart(10)}`,
    );
  }
  if (!aplicar) {
    console.log("\nPrévia: nada foi gravado. Rode com --aplicar para gravar.");
    process.exit(0);
  }

  // 1. liga a regra a partir do mês
  const { error: ec } = await db.from("vendas_config").upsert({ id: true, liquido_real_desde: `${desde}-01`, atualizado_em: new Date().toISOString() });
  if (ec) throw new Error(`config: ${ec.message}`);
  // 2. grava subtotal/receita que faltam: o gatilho recalcula a cópia (snap_*) da venda
  let gravadas = 0;
  for (const { v, receita, subtotal } of mudar) {
    const campos = {};
    if (v.valor_pago == null) campos.valor_pago = subtotal / 100;
    if (v.receita_liquida == null) campos.receita_liquida = receita / 100;
    if (!Object.keys(campos).length) {
      // já tinha os dois valores: força o recálculo regravando o subtotal (null → valor)
      await db.from("vendas").update({ valor_pago: null }).eq("id", v.id);
      campos.valor_pago = subtotal / 100;
    }
    const { error: eu } = await db.from("vendas").update(campos).eq("id", v.id);
    if (eu) throw new Error(`venda ${v.id}: ${eu.message}`);
    gravadas++;
  }
  console.log(`\nRegra ligada a partir de ${desde}. Recalculadas: ${gravadas} venda(s). Mês fechado: ${pulasFechado.length} pulada(s).`);
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
}
