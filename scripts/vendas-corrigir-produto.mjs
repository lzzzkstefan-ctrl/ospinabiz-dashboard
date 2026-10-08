// Vendas: aplica a REGRA A nas vendas já gravadas, a partir da planilha de faturas da Hubla.
// Regra A (scripts/vendas-planilha-hubla.mjs → classificar): Protocolo Game Changer na venda,
// como principal OU orderbump = ticket, pelo VALOR cobrado do Protocolo (nome da oferta
// ignorado); valor sem ticket → "a revisar"; sem Protocolo → "sem comissão (produto)".
// Bump nunca entra em número nenhum. Este script não contém nenhum dado de cliente.
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/vendas-corrigir-produto.mjs --arquivo=<.xlsx>
//       → prévia: por vendedor e mês, o que muda (qtd por ticket, líquido, comissão 6%–10%)
//   ... --final=3118                                     → mostra também essa venda, mude ou não
//   ... --aplicar --mes=2026-06 --utm=davi                → grava UM mês de UM vendedor (mês aberto)
//   ... --aplicar --mes=2026-06 --utm=davi --fechado-ok   → mês já fechado: só com OK do Davi
//
// Compara cada venda (pelo ID da fatura e do mesmo vendedor/utm) com o resultado da regra:
// produto → ticket, ticket → outro ticket, ticket → a revisar, a revisar → ticket etc.
// O snapshot de valores é refeito pelo banco quando o ticket muda (trigger).

import { createClient } from "@supabase/supabase-js";
import { brl, cents, classificar, FAIXAS, itensDaLinha, lerPlanilha, semAcento } from "./vendas-planilha-hubla.mjs";

const aplicar = process.argv.includes("--aplicar");
const fechadoOk = process.argv.includes("--fechado-ok");
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const arquivo = arg("arquivo");
const mesAplicar = arg("mes");
const utmAplicar = (arg("utm") ?? "").toLowerCase().replace(/\s+/g, "");
const finalVer = arg("final");
if (!arquivo) {
  console.error("Informe --arquivo=<planilha .xlsx da Hubla>");
  process.exit(1);
}
if (aplicar && (!/^\d{4}-\d{2}$/.test(mesAplicar ?? "") || !utmAplicar)) {
  console.error("Para gravar, informe UM mês e UM vendedor: --aplicar --mes=AAAA-MM --utm=<código>");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const mais = (c) => `${c >= 0 ? "+" : "−"}R$ ${brl(Math.abs(c))}`;
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "");

try {
  const { aba, linhas } = lerPlanilha(arquivo, arg("aba"));
  const [cab, ...corpo] = linhas;
  const col = (n) => cab.findIndex((h) => semAcento(h) === semAcento(n));
  const C = { termo: col("UTM Termo"), id: col("ID da fatura"), oferta: col("Nome da oferta"), produto: col("Nome do produto"), bump: col("Nome do produto de orderbump"), valor: col("Valor do produto") };
  const faltando = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k);
  if (faltando.length) throw new Error(`colunas não encontradas: ${faltando.join(", ")}`);

  const [{ data: tickets, error: et }, { data: vendedores, error: ev }, { data: fechamentos, error: ef }] = await Promise.all([
    db.from("tickets").select("*"),
    db.from("vendedores").select("equipe_id, utm_term, equipe(nome)"),
    db.from("vendas_fechamentos").select("mes, vendedor_id, faixa, comissao"),
  ]);
  if (et || ev || ef) throw new Error((et ?? ev ?? ef).message);
  const ticketPorId = new Map(tickets.map((t) => [t.id, t]));
  const vendedorPorId = new Map(vendedores.map((v) => [v.equipe_id, v]));
  const fechado = new Map(fechamentos.map((f) => [`${f.vendedor_id} ${f.mes.slice(0, 7)}`, f]));
  const vendas = new Map();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .from("vendas")
      .select("id, id_fatura, vendedor_id, status, data, final_lead, ticket_id, principal_produto, bumps")
      .order("id")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    data.forEach((v) => vendas.set(v.id_fatura, v));
    if (data.length < 1000) break;
  }

  const nomeT = (t) => (t ? (t.nome ?? `R$ ${brl(cents(t.valor_bruto))}`) : null);
  const estado = (ticket, produto) => (ticket ? `ticket ${nomeT(ticket)}` : produto ? "sem comissão (produto)" : "a revisar");
  const mudam = [];
  const ver = [];
  const vistas = new Set();
  let conferidas = 0;
  for (const l of corpo) {
    const id = String(l[C.id] ?? "").trim();
    const v = vendas.get(id);
    if (!v || vistas.has(id)) continue;
    vistas.add(id);
    const vendedor = vendedorPorId.get(v.vendedor_id);
    // só a venda do próprio vendedor da planilha (mesmo utm), para não cruzar dados
    if (!vendedor || norm(l[C.termo]) !== norm(vendedor.utm_term)) continue;
    conferidas++;
    const oferta = String(l[C.oferta] ?? "").trim();
    const p = classificar(oferta, itensDaLinha(l[C.produto], l[C.bump]), l[C.valor], tickets);
    const antes = v.ticket_id ? ticketPorId.get(v.ticket_id) : null;
    const item = { v, vendedor, antes, depois: p.ticket, produtoDepois: p.produto, motivo: p.motivo, bumps: p.bumps, oferta, valorTicket: p.valorTicket };
    const muda = (v.ticket_id ?? null) !== (p.ticket?.id ?? null) || (!v.ticket_id && !p.ticket && v.principal_produto !== p.produto);
    if (muda) mudam.push(item);
    if (finalVer && v.final_lead === finalVer) ver.push({ ...item, muda });
  }

  console.log(`REGRA A nas vendas gravadas — ${aplicar ? `GRAVANDO ${utmAplicar} ${mesAplicar}` : "PRÉVIA (nada gravado)"} — aba "${aba}" — ${conferidas} vendas conferidas com a planilha`);
  for (const x of ver) {
    console.log(
      `\nVenda final ${finalVer} (${x.vendedor.utm_term}, ${x.v.data}, ${x.v.status}): hoje ${estado(x.antes, x.v.principal_produto)} → regra A: ${estado(x.depois, x.produtoDepois)}` +
        `${x.valorTicket != null ? ` (Protocolo cobrou R$ ${brl(x.valorTicket)})` : ""} · oferta "${x.oferta}"${x.bumps.length ? ` · bumps: ${x.bumps.join(", ")}` : ""}${x.muda ? "" : " · não muda"}`,
    );
  }

  const grupos = new Map();
  for (const g of mudam) {
    const k = `${g.vendedor.utm_term} ${g.v.data.slice(0, 7)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), g]);
  }
  if (!mudam.length) console.log("\nNenhuma venda muda com a regra A.");
  const val = (t, campo) => (t ? cents(t[campo]) : 0);
  for (const [k, lista] of [...grupos].sort()) {
    const [utm, mes] = k.split(" ");
    const f = fechado.get(`${lista[0].v.vendedor_id} ${mes}`);
    console.log(`\n## ${lista[0].vendedor.equipe.nome} (${utm}) · ${mes} — ${lista.length} venda(s) mudam — ${f ? `FECHADO (${f.faixa}%, comissão R$ ${brl(cents(f.comissao))}) — só com OK` : "aberto"}`);
    for (const g of lista.sort((a, b) => a.v.data.localeCompare(b.v.data))) {
      console.log(
        `  ${g.v.data}  final ${g.v.final_lead ?? "----"}  ${estado(g.antes, g.v.principal_produto)} → ${estado(g.depois, g.produtoDepois)}` +
          `${g.valorTicket != null ? ` (Protocolo R$ ${brl(g.valorTicket)})` : ""}${g.bumps.length ? `  bump: ${g.bumps.join(", ")}` : ""}${g.v.status !== "pago" ? `  [${g.v.status}]` : ""}`,
      );
    }
    const pagas = lista.filter((g) => g.v.status === "pago");
    const qtd = new Map();
    for (const g of pagas) {
      if (g.antes) qtd.set(nomeT(g.antes), (qtd.get(nomeT(g.antes)) ?? 0) - 1);
      if (g.depois) qtd.set(nomeT(g.depois), (qtd.get(nomeT(g.depois)) ?? 0) + 1);
    }
    const qtdTxt = [...qtd].filter(([, n]) => n).map(([t, n]) => `${n > 0 ? "+" : ""}${n} ${t}`).join(" · ") || "sem mudança de quantidade por ticket";
    console.log(`  Pagas por ticket: ${qtdTxt}`);
    console.log(`  Líquido ${mais(pagas.reduce((s, g) => s + val(g.depois, "valor_liquido") - val(g.antes, "valor_liquido"), 0))}`);
    console.log("  Comissão: " + FAIXAS.map((x) => `${x}% ${mais(pagas.reduce((s, g) => s + val(g.depois, `comissao_${x}`) - val(g.antes, `comissao_${x}`), 0))}`).join(" · "));
  }

  if (!aplicar) {
    console.log("\nPrévia: nada foi gravado. Para gravar: --aplicar --mes=AAAA-MM --utm=<código>");
  } else {
    const doMes = grupos.get(`${utmAplicar} ${mesAplicar}`) ?? [];
    if (!doMes.length) throw new Error(`nada para gravar em ${utmAplicar} ${mesAplicar}`);
    if (fechado.has(`${doMes[0].v.vendedor_id} ${mesAplicar}`) && !fechadoOk) throw new Error(`${mesAplicar} de ${utmAplicar} já está fechado: só grava com --fechado-ok (OK do Davi)`);
    let gravadas = 0;
    for (const g of doMes) {
      const { data, error } = await db
        .from("vendas")
        .update({
          ticket_id: g.depois?.id ?? null,
          principal_produto: g.depois ? false : g.produtoDepois,
          motivo_sem_ticket: g.depois ? null : g.motivo?.slice(0, 200) ?? null,
          bumps: g.bumps,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", g.v.id)
        .select("id");
      if (error) throw new Error(`venda ${g.v.data} final ${g.v.final_lead}: ${error.message} (${gravadas} já gravadas)`);
      gravadas += data.length;
    }
    console.log(`\nOK: ${gravadas} venda(s) de ${utmAplicar} ${mesAplicar} atualizadas pela regra A.`);
  }
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
}
