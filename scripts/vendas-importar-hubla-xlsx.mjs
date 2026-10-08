// Vendas: importa o histórico de UM vendedor a partir da exportação XLSX da Hubla
// (uma linha por fatura). Uso pensado para o histórico da Vyenna (utm "vyenna").
// - só as linhas com "UTM Termo" = utm informado; status "Paga" e "Reembolsada";
// - ticket: pelo VALOR COBRADO ("Valor do produto"), como no Lock in do masterview, e não
//   pelo preço escrito no nome da oferta (ex.: "Ticket - R$238,00" cobrava R$ 100,00).
//   Só para oferta de ticket ("Ticket - R$…" ou "Game Changer Society"). Com order bump o
//   valor vem somado, então vale o valor das vendas da mesma oferta SEM bump. Casa com
//   QUALQUER ticket (ativo ou inativo: no histórico valem os preços da época);
// - outra oferta (combo, produto): sem ticket e "sem comissão (produto)";
// - origem = 'importacao'; fatura que já existe aqui é pulada (não duplica);
// - a prévia mostra os totais por mês nas 5 faixas, pra conferir com o vendedor ANTES
//   de fechar qualquer mês. Os meses importados ficam abertos até o admin fechar.
// O arquivo tem dados de clientes: deixe fora do git (ex.: C:\dev\backups\...).
// Leitor de XLSX sem dependência, adaptado do scripts/import-hubla-xlsx.mjs do masterview.
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/vendas-importar-hubla-xlsx.mjs --arquivo=<.xlsx> --utm=vyenna            # prévia
//   node --env-file=.env.local scripts/vendas-importar-hubla-xlsx.mjs --arquivo=<.xlsx> --utm=vyenna --aplicar  # grava
//   ... --aba="nome da aba" (padrão: a primeira)

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const arquivo = arg("arquivo");
const utm = (arg("utm") ?? "").toLowerCase().replace(/\s+/g, "");
const abaPedida = arg("aba");
if (!arquivo || !utm) {
  console.error("Informe --arquivo=<planilha .xlsx da Hubla> e --utm=<código do vendedor>");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

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

function lerPlanilha(caminho, nomeAba) {
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

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const ehItemDeTicket = (nome) => /game\s*changer\s*society/i.test(nome) || /ticket\s*-?\s*r\$/i.test(nome);
function precoDoNome(nome) {
  const m = nome.match(/r\$\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!m) return null;
  const [inteiro, decimal = "0"] = m[1].replace(/\./g, "").split(",");
  const valor = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}
const cents = (v) => Math.round(Number(v) * 100);
const brl = (c) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS = { paga: "pago", reembolsada: "reembolso" };
const FAIXAS = [6, 7, 8, 9, 10];

/** "25/09/2026 14:03:11" (horário de Brasília) → { dia: "2026-09-25", instante: ISO } */
function dataDe(txt) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(txt ?? "").trim());
  if (!m) return null;
  const p = (x) => String(x ?? 0).padStart(2, "0");
  const dia = `${m[3]}-${p(m[2])}-${p(m[1])}`;
  return { dia, instante: m[4] ? new Date(`${dia}T${p(m[4])}:${m[5]}:${p(m[6])}-03:00`).toISOString() : null };
}

function finalDoLead(utmConteudo, telefone) {
  const lead = /^lead_(\+?[\d\s().-]+)$/i.exec(String(utmConteudo ?? "").trim());
  const digitos = (lead ? lead[1] : String(telefone ?? "")).replace(/\D/g, "");
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

// ---------- main ----------

try {
  const { aba, linhas } = lerPlanilha(arquivo, abaPedida);
  const [cab, ...corpo] = linhas;
  const col = (...nomes) => cab.findIndex((h) => nomes.some((n) => semAcento(h) === semAcento(n)));
  const C = {
    termo: col("UTM Termo"),
    conteudo: col("UTM Conteúdo"),
    id: col("ID da fatura"),
    data: col("Data de pagamento"),
    status: col("Status da fatura", "Status"),
    nome: col("Nome do cliente"),
    telefone: col("Telefone do cliente"),
    oferta: col("Nome da oferta"),
    produto: col("Nome do produto"),
    bump: col("Nome do produto de orderbump"),
    valorProduto: col("Valor do produto"),
  };
  const faltando = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k);
  if (faltando.length) throw new Error(`colunas não encontradas: ${faltando.join(", ")}. Cabeçalho da aba "${aba}": ${cab.join(" | ")}`);

  const { data: vendedor, error: ev } = await db.from("vendedores").select("equipe_id, equipe(nome)").eq("utm_term", utm).single();
  if (ev || !vendedor) throw new Error(`vendedor com utm "${utm}" não encontrado`);
  const { data: tickets, error: et } = await db.from("tickets").select("*");
  if (et) throw new Error(et.message);
  const existentes = new Set();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from("vendas").select("id_fatura").order("id").range(de, de + 999);
    if (error) throw new Error(error.message);
    data.forEach((v) => existentes.add(v.id_fatura));
    if (data.length < 1000) break;
  }

  // valor cobrado de cada oferta SEM order bump (o mais comum), para as vendas com bump
  const doUtm = (l) => String(l[C.termo] ?? "").toLowerCase().replace(/\s+/g, "") === utm;
  const contagem = new Map();
  for (const l of corpo) {
    if (!doUtm(l) || String(l[C.bump] ?? "").trim()) continue;
    const oferta = String(l[C.oferta] ?? "").trim();
    const m = contagem.get(oferta) ?? new Map();
    const v = cents(l[C.valorProduto]);
    m.set(v, (m.get(v) ?? 0) + 1);
    contagem.set(oferta, m);
  }
  const baseDaOferta = new Map([...contagem].map(([o, m]) => [o, [...m].sort((a, b) => b[1] - a[1])[0][0]]));

  const cont = { linhas: corpo.length, outro: 0, statusIgnorado: new Map(), semId: 0, semData: 0, jaExiste: 0 };
  const novas = [];
  const vistas = new Set();
  for (const l of corpo) {
    if (String(l[C.termo] ?? "").toLowerCase().replace(/\s+/g, "") !== utm) { cont.outro++; continue; }
    const stBruto = String(l[C.status] ?? "").trim();
    const status = STATUS[semAcento(stBruto)];
    if (!status) { cont.statusIgnorado.set(stBruto || "(vazio)", (cont.statusIgnorado.get(stBruto || "(vazio)") ?? 0) + 1); continue; }
    const id = String(l[C.id] ?? "").trim();
    if (!id) { cont.semId++; continue; }
    const data = dataDe(l[C.data]);
    if (!data) { cont.semData++; continue; }
    if (vistas.has(id)) continue;
    vistas.add(id);
    if (existentes.has(id)) { cont.jaExiste++; continue; }

    const oferta = String(l[C.oferta] ?? "").trim();
    const produto = String(l[C.produto] ?? "").trim();
    const bumpsBrutos = String(l[C.bump] ?? "").split(",").map((b) => b.trim()).filter(Boolean);
    // Ticket pelo valor cobrado da oferta de ticket; com bump, o valor da oferta sem bump.
    const ehTicket = ehItemDeTicket(oferta);
    const preco = !ehTicket ? null : bumpsBrutos.length ? (baseDaOferta.get(oferta) ?? null) : cents(l[C.valorProduto]);
    const ticket = preco === null ? null : tickets.find((t) => cents(t.valor_bruto) === preco) ?? null;
    const principalProduto = !ehTicket;
    const motivo = ticket
      ? null
      : principalProduto
        ? `produto sem comissão${oferta ? `: ${oferta}` : ""}`
        : preco !== null
          ? `cobrado R$ ${brl(preco)}, sem ticket desse valor (${oferta})`
          : `oferta de ticket sem valor sem bump para comparar: ${oferta}`;

    novas.push({
      venda: {
        id_fatura: id,
        vendedor_id: vendedor.equipe_id,
        forma_atribuicao: "utm",
        atribuida_em: data.instante,
        utm_term: utm,
        ticket_id: ticket?.id ?? null,
        motivo_sem_ticket: motivo?.slice(0, 200) ?? null,
        itens: [produto && oferta ? `${produto} - ${oferta}` : produto || oferta].filter(Boolean),
        bumps: bumpsBrutos,
        status,
        pago_em: data.instante,
        data: data.dia,
        final_lead: finalDoLead(l[C.conteudo], l[C.telefone]),
        origem: "importacao",
        principal_produto: principalProduto,
      },
      oferta,
      cliente: { nome: String(l[C.nome] ?? "").trim() || null, telefone: String(l[C.telefone] ?? "").trim() || null },
      ticket,
    });
  }

  // ---------- prévia por mês (para conferir com o vendedor) ----------
  const meses = new Map();
  for (const n of novas) {
    const m = n.venda.data.slice(0, 7);
    const t = meses.get(m) ?? { pagas: 0, comTicket: 0, semTicket: 0, reemb: 0, bruto: 0, liquido: 0, com: Object.fromEntries(FAIXAS.map((f) => [f, 0])) };
    if (n.venda.status === "reembolso") t.reemb++;
    else {
      t.pagas++;
      if (n.ticket) {
        t.comTicket++;
        t.bruto += cents(n.ticket.valor_bruto);
        t.liquido += cents(n.ticket.valor_liquido);
        for (const f of FAIXAS) t.com[f] += cents(n.ticket[`comissao_${f}`]);
      } else t.semTicket++;
    }
    meses.set(m, t);
  }

  console.log(`IMPORTAÇÃO DA PLANILHA DA HUBLA — ${aplicar ? "APLICANDO" : "PRÉVIA (nada gravado)"} — aba "${aba}", ${cont.linhas} linhas`);
  console.log(`Vendedor: ${vendedor.equipe.nome} (utm "${utm}") · novas: ${novas.length} · já existiam: ${cont.jaExiste} · de outros/sem utm: ${cont.outro}`);
  if (cont.statusIgnorado.size) console.log(`Status ignorados (não são Paga/Reembolsada): ${[...cont.statusIgnorado].map(([s, q]) => `${q}x ${s}`).join(" · ")}`);
  if (cont.semId || cont.semData) console.log(`Sem id da fatura: ${cont.semId} · sem data de pagamento: ${cont.semData}`);
  console.log("\nMês      Pagas  c/ticket  s/ticket  Reemb.         Bruto       Líquido   " + FAIXAS.map((f) => `Com.${f}%`.padStart(10)).join(" "));
  for (const [m, t] of [...meses].sort()) {
    console.log(
      `${m}  ${String(t.pagas).padStart(5)}  ${String(t.comTicket).padStart(8)}  ${String(t.semTicket).padStart(8)}  ${String(t.reemb).padStart(6)}  ${brl(t.bruto).padStart(12)}  ${brl(t.liquido).padStart(12)}  ` +
        FAIXAS.map((f) => brl(t.com[f]).padStart(10)).join(" "),
    );
  }
  const ligacao = new Map();
  for (const n of novas) {
    const k = `${n.oferta || "(sem oferta)"} → ${n.ticket ? `ticket ${n.ticket.nome ?? brl(cents(n.ticket.valor_bruto))}` : n.venda.principal_produto ? "sem comissão (produto)" : "a revisar"}`;
    ligacao.set(k, (ligacao.get(k) ?? 0) + 1);
  }
  console.log("\nComo cada oferta foi ligada (pagas + reembolsos):");
  for (const [k, q] of [...ligacao].sort()) console.log(`  ${String(q).padStart(4)}x ${k}`);

  const semTicket = novas.filter((n) => !n.ticket && n.venda.status === "pago");
  if (semTicket.length) {
    const motivos = new Map();
    for (const n of semTicket) motivos.set(n.venda.motivo_sem_ticket, (motivos.get(n.venda.motivo_sem_ticket) ?? 0) + 1);
    console.log(`\nPagas sem ticket (contam na quantidade, sem comissão): ${semTicket.length}`);
    for (const [mot, q] of [...motivos].sort((a, b) => b[1] - a[1])) console.log(`  ${String(q).padStart(4)}x ${mot}`);
  }

  if (!aplicar) {
    console.log("\nPrévia: nada foi gravado. Confira os números com o vendedor e rode com --aplicar.");
    process.exit(0);
  }

  for (let i = 0; i < novas.length; i += 200) {
    const lote = novas.slice(i, i + 200);
    const { data: criadas, error } = await db.from("vendas").insert(lote.map((n) => n.venda)).select("id, id_fatura");
    if (error) throw new Error(`lote ${i / 200 + 1}: ${error.message}`);
    const idPorFatura = new Map(criadas.map((c) => [c.id_fatura, c.id]));
    const { error: ec } = await db.from("vendas_clientes").insert(lote.map((n) => ({ venda_id: idPorFatura.get(n.venda.id_fatura), ...n.cliente })));
    if (ec) throw new Error(`clientes do lote ${i / 200 + 1}: ${ec.message}`);
    console.log(`  gravadas ${Math.min(i + 200, novas.length)}/${novas.length}`);
  }
  console.log("\nGravado. Os meses ficam ABERTOS: feche só depois de o vendedor conferir na tela.");
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
}
