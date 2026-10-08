// Vendas: importa o histórico do Davi a partir do backup CSV do Lock in (masterview).
// - origem = 'importacao', vendedor = quem tem o utm informado (padrão "davi");
// - ticket achado pelo valor bruto (ativo ou inativo: no histórico valem os preços da época);
//   o trigger do banco grava o snapshot de cada venda;
// - cliente: só o primeiro nome (vendas_clientes) e os 4 últimos dígitos (final_lead);
// - fatura que já existe aqui é pulada (dá pra rodar de novo sem duplicar);
// - no fim, compara os totais por mês (vendas pagas com ticket, bruto, líquido e comissões)
//   do backup com o que ficou gravado aqui.
// Sem dados no script. Usa a chave secreta (SUPABASE_SECRET_KEY).
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/vendas-importar-masterview.mjs --backup=<pasta>            # prévia
//   node --env-file=.env.local scripts/vendas-importar-masterview.mjs --backup=<pasta> --aplicar  # grava

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const backup = arg("backup");
const utm = arg("utm") ?? "davi";
if (!backup) {
  console.error("Informe --backup=<pasta do backup do masterview>");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

function lerCsv(caminho) {
  const t = readFileSync(caminho, "utf8").replace(/^﻿/, "");
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\r") continue;
    else if (c === "\n") { linha.push(campo); campo = ""; linhas.push(linha); linha = []; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...corpo] = linhas;
  return corpo.map((l) => Object.fromEntries(l.map((v, i) => [cab[i], v])));
}

const cents = (v) => Math.round(Number(v) * 100);
const brl = (c) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** a data do backup vem como instante (ex.: "2026-09-04T03:00:00.000Z") → dia em Brasília */
const diaSP = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date(v).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
const lista = (v) => { try { const x = JSON.parse(v || "[]"); return Array.isArray(x) ? x.map(String) : []; } catch { return []; } };
const STATUS = { Pago: "pago", Reembolso: "reembolso", Chargeback: "chargeback" };
const FAIXAS = [6, 7, 8, 9, 10];

/** Busca tudo em páginas de 1000 (limite do Supabase). */
async function todas(consulta) {
  const tudo = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta().range(de, de + 999);
    if (error) throw new Error(error.message);
    tudo.push(...data);
    if (data.length < 1000) return tudo;
  }
}

/** totais por mês das vendas PAGAS com ticket: { mes: { qtd, bruto, liquido, c6..c10 } } */
function totaisPorMes(itens) {
  const m = {};
  for (const x of itens) {
    const t = (m[x.mes] ??= { qtd: 0, bruto: 0, liquido: 0, ...Object.fromEntries(FAIXAS.map((f) => [`c${f}`, 0])) });
    t.qtd++;
    t.bruto += x.bruto;
    t.liquido += x.liquido;
    for (const f of FAIXAS) t[`c${f}`] += x[`c${f}`];
  }
  return m;
}

try {
  const vendasBk = lerCsv(join(backup, "vendas.csv"));
  const ticketsBk = new Map(lerCsv(join(backup, "tickets.csv")).map((t) => [t.id, t]));

  const { data: vendedor, error: ev } = await db.from("vendedores").select("equipe_id, equipe(nome)").eq("utm_term", utm).single();
  if (ev || !vendedor) throw new Error(`vendedor com utm "${utm}" não encontrado`);
  const { data: tickets, error: et } = await db.from("tickets").select("id, valor_bruto");
  if (et) throw new Error(et.message);
  const ticketPorBruto = new Map(tickets.map((t) => [cents(t.valor_bruto), t.id]));
  const existentes = new Set((await todas(() => db.from("vendas").select("id_fatura").order("id"))).map((v) => v.id_fatura));

  // ---------- monta as vendas ----------
  const faltaTicket = new Set();
  const novas = [];
  let jaExistem = 0;
  for (const v of vendasBk) {
    if (existentes.has(v.id_externo)) { jaExistem++; continue; }
    const tBk = v.ticket_id ? ticketsBk.get(v.ticket_id) : null;
    const ticketId = tBk ? ticketPorBruto.get(cents(tBk.valor_bruto)) ?? null : null;
    if (tBk && !ticketId) faltaTicket.add(brl(cents(tBk.valor_bruto)));
    const status = STATUS[v.status];
    if (!status) throw new Error(`status desconhecido no backup: ${v.status}`);
    const nome = v.cliente.replace(/\s*-\s*\d{4}$/, "").trim();
    const final = v.cliente.match(/-\s*(\d{4})$/)?.[1] ?? null;
    const motivo = tBk
      ? null
      : v.principal_produto === "true"
        ? `produto sem comissão${v.oferta ? `: ${v.oferta}` : ""}`
        : v.revisar_motivo || `sem ticket no histórico${v.oferta ? `: ${v.oferta}` : ""}`;
    novas.push({
      venda: {
        id_fatura: v.id_externo,
        vendedor_id: vendedor.equipe_id,
        forma_atribuicao: "utm",
        atribuida_em: v.pago_em || null,
        utm_term: utm,
        ticket_id: ticketId,
        motivo_sem_ticket: motivo?.slice(0, 200) ?? null,
        itens: lista(v.itens_fatura),
        bumps: lista(v.bumps),
        status,
        pago_em: v.pago_em || null,
        data: diaSP(v.data),
        final_lead: final,
        origem: "importacao",
      },
      nome,
      // para a conferência: valores do backup (os do masterview)
      conta: status === "pago" && tBk,
      tBk,
    });
  }
  if (faltaTicket.size) throw new Error(`faltam tickets aqui: R$ ${[...faltaTicket].join(", R$ ")} — rode antes scripts/vendas-base.mjs`);

  const esperado = totaisPorMes(
    vendasBk
      .filter((v) => v.status === "Pago" && v.ticket_id)
      .map((v) => {
        const t = ticketsBk.get(v.ticket_id);
        return { mes: diaSP(v.data).slice(0, 7), bruto: cents(t.valor_bruto), liquido: cents(t.valor_liquido), ...Object.fromEntries(FAIXAS.map((f) => [`c${f}`, cents(t[`comissao_${f}`])])) };
      }),
  );

  console.log(`IMPORTAÇÃO DO MASTERVIEW — ${aplicar ? "APLICANDO" : "PRÉVIA (nada gravado)"} — vendedor ${vendedor.equipe.nome} (utm "${utm}")`);
  console.log(`Backup: ${vendasBk.length} vendas · já existem aqui: ${jaExistem} · novas: ${novas.length}`);
  console.log(`Novas: ${novas.filter((n) => n.venda.status === "pago").length} pagas (${novas.filter((n) => n.conta).length} com ticket), ${novas.filter((n) => n.venda.status === "reembolso").length} reembolsos, ${novas.filter((n) => n.venda.status === "chargeback").length} chargebacks`);
  console.log("\nEsperado por mês (vendas pagas com ticket, do backup):");
  console.log("Mês       Vendas         Bruto       Líquido     Com. 6%     Com. 7%    Com. 10%");
  for (const [m, t] of Object.entries(esperado).sort()) {
    console.log(`${m}  ${String(t.qtd).padStart(6)}  ${brl(t.bruto).padStart(12)}  ${brl(t.liquido).padStart(12)}  ${brl(t.c6).padStart(10)}  ${brl(t.c7).padStart(10)}  ${brl(t.c10).padStart(10)}`);
  }

  if (!aplicar) {
    console.log("\nPrévia: nada foi gravado. Rode com --aplicar.");
    process.exit(0);
  }

  // ---------- grava (em lotes; rodar de novo completa o que faltar, sem duplicar) ----------
  for (let i = 0; i < novas.length; i += 200) {
    const lote = novas.slice(i, i + 200);
    const { data: criadas, error } = await db.from("vendas").insert(lote.map((n) => n.venda)).select("id, id_fatura");
    if (error) throw new Error(`lote ${i / 200 + 1}: ${error.message}`);
    const idPorFatura = new Map(criadas.map((c) => [c.id_fatura, c.id]));
    const { error: ec } = await db
      .from("vendas_clientes")
      .insert(lote.map((n) => ({ venda_id: idPorFatura.get(n.venda.id_fatura), nome: n.nome || null })));
    if (ec) throw new Error(`clientes do lote ${i / 200 + 1}: ${ec.message}`);
    console.log(`  gravadas ${Math.min(i + 200, novas.length)}/${novas.length}`);
  }

  // ---------- confere com o que ficou gravado (snapshot) ----------
  const gravadas = await todas(() =>
    db
      .from("vendas")
      .select("data, snap_bruto, snap_liquido, snap_comissao_6, snap_comissao_7, snap_comissao_8, snap_comissao_9, snap_comissao_10")
      .eq("vendedor_id", vendedor.equipe_id)
      .eq("origem", "importacao")
      .eq("status", "pago")
      .not("ticket_id", "is", null)
      .order("id"),
  );
  const obtido = totaisPorMes(
    gravadas.map((v) => ({
      mes: v.data.slice(0, 7),
      bruto: cents(v.snap_bruto),
      liquido: cents(v.snap_liquido),
      ...Object.fromEntries(FAIXAS.map((f) => [`c${f}`, cents(v[`snap_comissao_${f}`])])),
    })),
  );
  let tudoIgual = true;
  console.log("\nConferência (backup x gravado aqui):");
  for (const m of [...new Set([...Object.keys(esperado), ...Object.keys(obtido)])].sort()) {
    const a = esperado[m], b = obtido[m];
    const igual = a && b && ["qtd", "bruto", "liquido", ...FAIXAS.map((f) => `c${f}`)].every((k) => a[k] === b[k]);
    if (!igual) tudoIgual = false;
    console.log(`  ${m}: ${igual ? "igual ✓" : `DIFERENTE — backup ${JSON.stringify(a)} · aqui ${JSON.stringify(b)}`}`);
  }
  console.log(tudoIgual ? "\nTudo igual ao masterview." : "\nHá diferença: confira antes de usar.");
  if (!tudoIgual) process.exitCode = 1;
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
}
