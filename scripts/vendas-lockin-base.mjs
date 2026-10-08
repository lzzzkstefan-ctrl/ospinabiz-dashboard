// Vendas: completa os dados da tela "Lock in" a partir do backup do masterview
// (C:\dev\backups\masterview\lock-in-*\). Só o backup, nunca o Supabase de lá.
// - tickets: nome, cor e ordem (pelo valor bruto); tickets sem par no backup ficam com
//   o nome curto ("R$238") e sem cor (a tela usa uma cor neutra);
// - vendas do Davi: principal_produto (pelo id da fatura) e a data do backup, se diferente;
// - vendas_config: WhatsApp do Rodrigo (whatsapp_chefe).
// Prévia por padrão; grava com --aplicar. Não mostra dados de cliente nem o número.
//
// Uso: node --env-file=.env.local scripts/vendas-lockin-base.mjs --pasta=C:\dev\backups\masterview\lock-in-2026-10-08_1213 [--aplicar]

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const pasta = process.argv.find((a) => a.startsWith("--pasta="))?.slice(8);
if (!pasta) {
  console.error("Informe --pasta=<pasta do backup do Lock in>");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

function lerCsv(arquivo) {
  const texto = readFileSync(join(pasta, arquivo), "utf8").replace(/^\uFEFF/, "");
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((x) => x !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...corpo] = linhas;
  return corpo.map((l) => Object.fromEntries(cab.map((h, i) => [h, l[i] ?? ""])));
}

const cents = (v) => Math.round(Number(v) * 100);
const precoCurto = (c) => `R$${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: c % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

async function todas(consulta) {
  const tudo = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta().range(de, de + 999);
    if (error) throw new Error(error.message);
    tudo.push(...data);
    if (data.length < 1000) return tudo;
  }
}

try {
  const ticketsBk = lerCsv("tickets.csv");
  const vendasBk = lerCsv("vendas.csv");
  const configBk = lerCsv("lock_in_config.csv")[0] ?? {};

  // ---------- tickets ----------
  const { data: tickets, error: et } = await db.from("tickets").select("id, valor_bruto, nome, cor, ordem");
  if (et) throw new Error(et.message);
  const bkPorBruto = new Map(ticketsBk.map((t) => [cents(t.valor_bruto), t]));
  const ordemMax = Math.max(0, ...ticketsBk.map((t) => Number(t.ordem)));
  let novos = 0;
  const mudTickets = tickets
    .sort((a, b) => cents(a.valor_bruto) - cents(b.valor_bruto))
    .map((t) => {
      const bk = bkPorBruto.get(cents(t.valor_bruto));
      return {
        id: t.id,
        nome: bk?.nome || precoCurto(cents(t.valor_bruto)).replace("R$", "R$ "),
        cor: bk?.cor?.toLowerCase() || null,
        ordem: bk ? Number(bk.ordem) : ordemMax + 1 + novos++,
        doBackup: !!bk,
        bruto: cents(t.valor_bruto),
      };
    });
  console.log("Tickets:");
  for (const t of mudTickets) console.log(`  ${precoCurto(t.bruto).padEnd(10)} nome "${t.nome}" · cor ${t.cor ?? "(neutra)"} · ordem ${t.ordem}${t.doBackup ? "" : " · sem par no backup"}`);

  // ---------- vendas do Davi ----------
  const vendas = await todas(() => db.from("vendas").select("id, id_fatura, data, principal_produto").eq("origem", "importacao").order("id"));
  const porFatura = new Map(vendas.map((v) => [v.id_fatura, v]));
  const mudVendas = [];
  let semPar = 0, datasDiferentes = 0, produto = 0;
  for (const b of vendasBk) {
    const v = porFatura.get(b.id_externo);
    if (!v) { semPar++; continue; }
    const pp = b.principal_produto === "true";
    const data = b.data.slice(0, 10);
    if (pp) produto++;
    if (data !== v.data) datasDiferentes++;
    if (pp !== v.principal_produto || data !== v.data) mudVendas.push({ id: v.id, principal_produto: pp, data });
  }
  console.log(`\nVendas do backup: ${vendasBk.length} · com par aqui: ${vendasBk.length - semPar} · sem par: ${semPar}`);
  console.log(`  "sem comissão (produto)": ${produto} · data diferente da do backup: ${datasDiferentes} · a atualizar: ${mudVendas.length}`);

  // ---------- WhatsApp ----------
  const zap = String(configBk.whatsapp_chefe ?? "").replace(/\D/g, "") || null;
  console.log(`\nWhatsApp do Rodrigo no backup: ${zap ? `sim (${zap.length} dígitos)` : "não"}`);

  if (!aplicar) {
    console.log("\nPrévia: nada foi gravado. Rode com --aplicar.");
    process.exit(0);
  }

  for (const t of mudTickets) {
    const { error } = await db.from("tickets").update({ nome: t.nome, cor: t.cor, ordem: t.ordem }).eq("id", t.id);
    if (error) throw new Error(`ticket ${t.id}: ${error.message}`);
  }
  for (let i = 0; i < mudVendas.length; i += 50) {
    await Promise.all(
      mudVendas.slice(i, i + 50).map(async (m) => {
        const { error } = await db.from("vendas").update({ principal_produto: m.principal_produto, data: m.data }).eq("id", m.id);
        if (error) throw new Error(`venda ${m.id}: ${error.message}`);
      }),
    );
  }
  if (zap) {
    const { error } = await db.from("vendas_config").upsert({ id: true, whatsapp_fechamento: zap, atualizado_em: new Date().toISOString() });
    if (error) throw new Error(`config: ${error.message}`);
  }
  console.log("\nGravado.");
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
}
