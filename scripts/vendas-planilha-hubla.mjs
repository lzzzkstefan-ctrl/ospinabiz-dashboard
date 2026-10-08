// Vendas: planilha de faturas da Hubla (XLSX, uma linha por fatura). Leitor sem dependência
// e a regra do ticket, usados por scripts/vendas-importar-hubla-xlsx.mjs e
// scripts/vendas-corrigir-produto.mjs. Este arquivo não contém nenhum dado de cliente.
// Leitor e regra adaptados do scripts/import-hubla-xlsx.mjs do masterview (mesma regra
// nos dois, para os números baterem).

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

// ---------- leitor mínimo de XLSX (zip + XML) ----------

function lerZip(buf) {
  let fim = buf.length - 22;
  while (fim >= 0 && buf.readUInt32LE(fim) !== 0x06054b50) fim--;
  if (fim < 0) throw new Error("não parece um .xlsx (zip inválido)");
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const arquivos = new Map();
  for (let i = 0; i < total; i++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const nomeLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const comLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + nomeLen);
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(ini, ini + tamComp);
    arquivos.set(nome, () => (metodo === 0 ? dados : inflateRawSync(dados)).toString("utf8"));
    p += 46 + nomeLen + extraLen + comLen;
  }
  return arquivos;
}

const desescapar = (s) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" }[e.toLowerCase()],
  );
const textoDe = (xml) => desescapar([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

function colunaIdx(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** serial do Excel (dias desde 1899-12-30) → "dd/mm/aaaa hh:mm:ss" */
function serialParaTexto(n) {
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function lerPlanilha(caminho, nomeAba) {
  const zip = lerZip(readFileSync(caminho));
  const ler = (n) => {
    const f = zip.get(n);
    if (!f) throw new Error(`faltou ${n} dentro do .xlsx`);
    return f();
  };
  const compartilhadas = zip.has("xl/sharedStrings.xml")
    ? [...ler("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]))
    : [];
  const workbook = ler("xl/workbook.xml");
  const rels = ler("xl/_rels/workbook.xml.rels");
  const abas = [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]*)"/g)].map((m) => ({ nome: desescapar(m[1]), rid: m[2] }));
  const aba = (nomeAba && abas.find((a) => a.nome === nomeAba)) || abas[0];
  if (!aba) throw new Error("planilha sem abas");
  if (nomeAba && aba.nome !== nomeAba) console.log(`(aba "${nomeAba}" não encontrada; usando "${aba.nome}". Abas: ${abas.map((a) => a.nome).join(" | ")})`);
  const alvo =
    new RegExp(`<Relationship\\b[^>]*\\bId="${aba.rid}"[^>]*\\bTarget="([^"]*)"`).exec(rels)?.[1] ??
    new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]*)"[^>]*\\bId="${aba.rid}"`).exec(rels)?.[1];
  const caminhoAba = alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo}`;
  const estilos = zip.has("xl/styles.xml") ? ler("xl/styles.xml") : "";
  const fmtsData = new Set([14, 15, 16, 17, 22, 45, 46, 47]);
  for (const m of estilos.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    if (/[dy]/i.test(m[2]) && !/\[[^\]]*\]/.test(m[2].replace(/\[\$[^\]]*\]/g, ""))) fmtsData.add(Number(m[1]));
  }
  const xfs = [...(estilos.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "").matchAll(/<xf\b[^>]*?numFmtId="(\d+)"/g)].map((m) => Number(m[1]));

  const linhas = [];
  for (const row of ler(caminhoAba).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cel = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const tipo = /\bt="(\w+)"/.exec(attrs)?.[1];
      const estilo = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
      const corpo = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      let valor = "";
      if (tipo === "s") valor = compartilhadas[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = textoDe(corpo);
      else if (v != null) valor = estilo >= 0 && fmtsData.has(xfs[estilo]) ? serialParaTexto(Number(v)) : desescapar(v);
      cel[ref ? colunaIdx(ref) : cel.length] = valor;
    }
    linhas.push(Array.from(cel, (x) => x ?? ""));
  }
  return { aba: aba.nome, linhas };
}

// ---------- regras (as mesmas de modulos/vendas/regras.ts) ----------

export const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const ehItemDeTicket = (nome) => /game\s*changer\s*society/i.test(nome) || /ticket\s*-?\s*r\$/i.test(nome);
export function precoDoNome(nome) {
  const m = nome.match(/r\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!m) return null;
  const [inteiro, decimal = "0"] = m[1].replace(/\./g, "").split(",");
  const valor = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}
export const cents = (v) => Math.round(Number(v) * 100);
export const brl = (c) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const STATUS = { paga: "pago", reembolsada: "reembolso" };
export const FAIXAS = [6, 7, 8, 9, 10];

/** "25/09/2026 14:03:11" (horário de Brasília) → { dia: "2026-09-25", instante: ISO } */
export function dataDe(txt) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(txt ?? "").trim());
  if (!m) return null;
  const p = (x) => String(x ?? 0).padStart(2, "0");
  const dia = `${m[3]}-${p(m[2])}-${p(m[1])}`;
  return { dia, instante: m[4] ? new Date(`${dia}T${p(m[4])}:${m[5]}:${p(m[6])}-03:00`).toISOString() : null };
}

export function finalDoLead(utmConteudo, telefone) {
  const lead = /^lead_(\+?[\d\s().-]+)$/i.exec(String(utmConteudo ?? "").trim());
  const digitos = (lead ? lead[1] : String(telefone ?? "")).replace(/\D/g, "");
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

// ---------- ticket x order bump ----------
// Regra do Davi (08/10/2026): comissão só do produto PRINCIPAL; order bump nunca entra.
// - principal = "Nome do produto" / "Nome da oferta". Se a oferta é de ticket ("Ticket - R$…"
//   ou "Game Changer Society"), a venda é de ticket. Se o principal é combo, Nexus, Acesso
//   Vitalício etc., é "sem comissão (produto)" MESMO com "Protocolo Game Changer" no bump.
// - valor cobrado do principal = "Valor do produto" − preços dos bumps (BUMPS), porque a
//   planilha soma tudo e não traz o valor de cada item.
// - preço escrito no nome ≠ valor cobrado → NÃO escolhe ticket: vai para "a revisar" com o
//   motivo ("oferta diz R$238, cobrou R$100") e o Davi escolhe na mão.
// - nome e cobrado iguais (ou nome sem preço): ticket com esse valor, ativo ou inativo (no
//   histórico vale o preço da época); sem ticket com esse valor → "a revisar".

/** preço de checkout de cada produto quando entra como order bump (centavos) */
export const BUMPS = new Map([
  ["50 templates de copys para stories validadas do ruyter", 2890],
  ["acesso vitalício", 4890],
  ["combo game changer", 9890],
  ["nexus pgc", 5890],
  ["protocolo game changer", 29890],
]);
const baixa = (s) => String(s ?? "").trim().toLowerCase();
const precoCurto = (c) => `R$${Math.floor(c / 100).toLocaleString("pt-BR")}${c % 100 ? `,${String(c % 100).padStart(2, "0")}` : ""}`;

/** Itens da linha: [Nome do produto, ...orderbumps] */
export const itensDaLinha = (produto, orderbumps) =>
  [String(produto ?? "").trim(), ...String(orderbumps ?? "").split(",").map((b) => b.trim())].filter(Boolean);

/** nomes = [Nome do produto, ...orderbumps] → { ticket, produto, motivo, bumps } */
export function classificar(oferta, nomes, valorProduto, tickets) {
  const principal = nomes[0] ?? "";
  const bumps = nomes.slice(1);
  const ehTicket = ehItemDeTicket(oferta) || ehItemDeTicket(principal);
  if (!ehTicket) return { ticket: null, produto: true, bumps, motivo: `produto sem comissão${oferta ? `: ${oferta}` : ""}` };

  const semPreco = bumps.filter((n) => !BUMPS.has(baixa(n)));
  if (semPreco.length) return { ticket: null, produto: false, bumps, motivo: `bump sem preço conhecido (${semPreco.join(", ")}): escolher o ticket na mão` };
  const cobrado = cents(valorProduto) - bumps.reduce((soma, n) => soma + BUMPS.get(baixa(n)), 0);
  const doNome = precoDoNome(oferta);
  if (doNome !== null && doNome !== cobrado) {
    return { ticket: null, produto: false, bumps, motivo: `oferta diz ${precoCurto(doNome)}, cobrou ${precoCurto(cobrado)}` };
  }
  const t = tickets.find((x) => x.ativo && cents(x.valor_bruto) === cobrado) ?? tickets.find((x) => cents(x.valor_bruto) === cobrado) ?? null;
  if (t) return { ticket: t, produto: false, bumps, motivo: null };
  return { ticket: null, produto: false, bumps, motivo: `cobrou ${precoCurto(cobrado)}, sem ticket desse valor (${oferta})` };
}
