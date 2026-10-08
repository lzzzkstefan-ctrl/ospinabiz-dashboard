// Vendas: ajustes de base antes de importar o histórico.
//  1. papel "admin" no login do vendedor "davi" (app_metadata.papel; o RLS usa isso);
//  2. tickets: confere os do backup do masterview com os daqui (mesmo bruto = mesmos valores)
//     e cria INATIVOS os que faltam (ex.: R$ 398,90), pra o histórico achar o ticket;
//  3. e-mail de acesso de um vendedor (para o convite), passado na linha de comando.
// Sem dados no script: tudo vem do banco, do backup ou da linha de comando.
// Usa a chave secreta (SUPABASE_SECRET_KEY): roda só na máquina do admin.
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/vendas-base.mjs --backup=<pasta> [--email=<utm>:<email>]            # prévia
//   node --env-file=.env.local scripts/vendas-base.mjs --backup=<pasta> [--email=<utm>:<email>] --aplicar  # grava

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const backup = arg("backup");
const email = arg("email");
if (!backup) {
  console.error("Informe --backup=<pasta do backup do masterview>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SECRET_KEY;
if (!url || !chave) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY no .env.local");
  process.exit(1);
}
const db = createClient(url, chave, { auth: { persistSession: false } });

/** CSV com aspas (RFC 4180), separador vírgula, com BOM. → lista de objetos pelo cabeçalho */
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
const CAMPOS = ["valor_liquido", "comissao_6", "comissao_7", "comissao_8", "comissao_9", "comissao_10"];
const brl = (c) => (c / 100).toFixed(2).replace(".", ",");

const pendente = [];
let problema = false;

// ---------- 1. admin ----------
const { data: davi, error: e1 } = await db.from("vendedores").select("equipe_id, equipe(nome, usuario_id)").eq("utm_term", "davi").single();
if (e1 || !davi?.equipe?.usuario_id) {
  console.error("Vendedor 'davi' sem login ligado (equipe.usuario_id).");
  process.exit(1);
}
const { data: u } = await db.auth.admin.getUserById(davi.equipe.usuario_id);
const papel = u.user?.app_metadata?.papel ?? null;
console.log(`1. Papel do login de ${davi.equipe.nome}: ${papel ?? "(nenhum)"}${papel === "admin" ? " ✓" : " → vai virar admin"}`);
if (papel !== "admin") pendente.push(async () => {
  const { error } = await db.auth.admin.updateUserById(davi.equipe.usuario_id, { app_metadata: { ...u.user.app_metadata, papel: "admin" } });
  if (error) throw new Error(`papel admin: ${error.message}`);
});

// ---------- 2. tickets ----------
const doBackup = lerCsv(join(backup, "tickets.csv"));
const { data: aqui, error: e2 } = await db.from("tickets").select("*");
if (e2) throw new Error(e2.message);
console.log(`\n2. Tickets: ${doBackup.length} no backup, ${aqui.length} aqui`);
for (const b of doBackup) {
  const igual = aqui.find((t) => cents(t.valor_bruto) === cents(b.valor_bruto));
  if (!igual) {
    console.log(`   R$ ${brl(cents(b.valor_bruto))}: falta → cria INATIVO (líquido ${brl(cents(b.valor_liquido))})`);
    pendente.push(async () => {
      const novo = { valor_bruto: Number(b.valor_bruto), ativo: false, ...Object.fromEntries(CAMPOS.map((c) => [c, Number(b[c])])) };
      const { error } = await db.from("tickets").insert(novo);
      if (error) throw new Error(`ticket R$ ${b.valor_bruto}: ${error.message}`);
    });
    continue;
  }
  const dif = CAMPOS.filter((c) => cents(igual[c]) !== cents(b[c]));
  if (dif.length) {
    problema = true;
    console.log(`   R$ ${brl(cents(b.valor_bruto))}: DIFERENTE em ${dif.join(", ")} — confira antes de importar`);
  } else console.log(`   R$ ${brl(cents(b.valor_bruto))}: igual ✓ (${igual.ativo ? "ativo" : "inativo"})`);
}

// ---------- 3. e-mail do vendedor ----------
if (email) {
  const [utm, endereco] = [email.slice(0, email.indexOf(":")), email.slice(email.indexOf(":") + 1).trim().toLowerCase()];
  if (!utm || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(endereco)) {
    console.error("Use --email=<utm>:<email>, ex.: --email=fulano:fulano@exemplo.com");
    process.exit(1);
  }
  const { data: v, error: e3 } = await db.from("vendedores").select("equipe_id, email, equipe(nome)").eq("utm_term", utm).maybeSingle();
  if (e3) throw new Error(`${e3.message} (a migration vendas_snapshot já foi aplicada?)`);
  if (!v) {
    console.error(`Vendedor com utm "${utm}" não existe.`);
    process.exit(1);
  }
  console.log(`\n3. E-mail de ${v.equipe.nome}: ${v.email ?? "(vazio)"} → ${endereco}${v.email === endereco ? " ✓" : ""}`);
  if (v.email !== endereco) pendente.push(async () => {
    const { error } = await db.from("vendedores").update({ email: endereco }).eq("equipe_id", v.equipe_id);
    if (error) throw new Error(`e-mail: ${error.message}`);
  });
}

if (problema) {
  console.error("\nHá ticket com valor diferente do masterview: nada foi gravado.");
  process.exit(1);
}
if (!pendente.length) {
  console.log("\nNada a fazer: tudo já está certo.");
} else if (!aplicar) {
  console.log(`\nPrévia: ${pendente.length} alteração(ões), nada foi gravado. Rode com --aplicar.`);
} else {
  for (const p of pendente) await p();
  console.log(`\nGravado: ${pendente.length} alteração(ões).`);
  if (papel !== "admin") console.log("O papel de admin vale depois que você sair e entrar de novo no painel.");
}
