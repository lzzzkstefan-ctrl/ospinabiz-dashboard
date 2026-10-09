// Vendas: importa vendas a partir da exportação XLSX da Hubla (uma linha por fatura).
// Dois modos:
// - --utm=<código>: só as vendas de UM vendedor (ex.: histórico da Vyenna, utm "vyenna");
// - --utm=todos: todas as vendas. UTM de vendedor cadastrado → atribuída a ele; sem UTM ou
//   UTM desconhecida → "A atribuir" (vendedor vazio; o admin atribui na tela).
// - --desde=AAAA-MM-DD / --ate=AAAA-MM-DD (opcionais): só vendas pagas nesse período (Brasília);
// - --historico-ate=AAAA-MM-DD (opcional, modo "todos"): venda sem vendedor paga até essa data
//   entra como "histórico sem vendedor" (sem_vendedor = sim): conta no total do admin, não vai
//   para "A revisar", não entra em comissão; só o admin atribui depois, se precisar;
// - status "Paga" e "Reembolsada";
// - ticket: pelo VALOR COBRADO ("Valor do produto") menos os preços dos bumps, como no Lock
//   in do masterview, e não pelo preço escrito no nome da oferta (ex.: "Ticket - R$238,00"
//   cobrava R$ 100,00). O item do ticket (Society/Protocolo) pode vir em qualquer coluna,
//   inclusive na de orderbump. Casa com QUALQUER ticket (ativo ou inativo: no histórico
//   valem os preços da época). Regra em scripts/vendas-planilha-hubla.mjs;
// - nenhum item de ticket (combo, produto sozinhos): sem ticket e "sem comissão (produto)";
// - origem = 'importacao'; fatura que já existe aqui é pulada (não duplica);
// - a prévia mostra os totais por mês nas 5 faixas, pra conferir com o vendedor ANTES
//   de fechar qualquer mês. Os meses importados ficam abertos até o admin fechar.
// O arquivo tem dados de clientes: deixe fora do git (ex.: C:\dev\backups\...).
// Leitor de XLSX em scripts/vendas-planilha-hubla.mjs (adaptado do masterview).
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/vendas-importar-hubla-xlsx.mjs --arquivo=<.xlsx> --utm=vyenna            # prévia
//   node --env-file=.env.local scripts/vendas-importar-hubla-xlsx.mjs --arquivo=<.xlsx> --utm=vyenna --aplicar  # grava
//   node --env-file=.env.local scripts/vendas-importar-hubla-xlsx.mjs --arquivo=<.xlsx> --utm=todos --desde=2026-09-05
//   ... --aba="nome da aba" (padrão: a primeira)

import { createClient } from "@supabase/supabase-js";
import { brl, cents, classificar, dataDe, FAIXAS, finalDoLead, itensDaLinha, lerPlanilha, semAcento, STATUS } from "./vendas-planilha-hubla.mjs";

const aplicar = process.argv.includes("--aplicar");
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const arquivo = arg("arquivo");
const utm = (arg("utm") ?? "").toLowerCase().replace(/\s+/g, "");
const abaPedida = arg("aba");
const todos = utm === "todos";
const desde = arg("desde") ?? null;
const ate = arg("ate") ?? null;
const historicoAte = arg("historico-ate") ?? null;
if (!arquivo || !utm) {
  console.error("Informe --arquivo=<planilha .xlsx da Hubla> e --utm=<código do vendedor ou todos>");
  process.exit(1);
}
for (const d of [desde, ate, historicoAte]) {
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    console.error(`Data inválida: "${d}". Use AAAA-MM-DD.`);
    process.exit(1);
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

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

  // utm → vendedor (no modo "todos", todos os vendedores ativos)
  const { data: vendedores, error: ev } = await db.from("vendedores").select("equipe_id, utm_term, equipe(nome)").eq("ativo", true);
  if (ev) throw new Error(ev.message);
  const vendedorDoUtm = new Map(vendedores.map((v) => [v.utm_term, v]));
  if (!todos && !vendedorDoUtm.has(utm)) throw new Error(`vendedor com utm "${utm}" não encontrado`);
  const { data: tickets, error: et } = await db.from("tickets").select("*");
  if (et) throw new Error(et.message);
  const existentes = new Set();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from("vendas").select("id_fatura").order("id").range(de, de + 999);
    if (error) throw new Error(error.message);
    data.forEach((v) => existentes.add(v.id_fatura));
    if (data.length < 1000) break;
  }

  const cont = { linhas: corpo.length, outro: 0, foraPeriodo: 0, statusIgnorado: new Map(), semId: 0, semData: 0, jaExiste: 0, repetidaNoArquivo: 0 };
  const novas = [];
  const vistas = new Set();
  for (const l of corpo) {
    const termo = String(l[C.termo] ?? "").toLowerCase().replace(/\s+/g, "");
    if (!todos && termo !== utm) { cont.outro++; continue; }
    const vendedor = vendedorDoUtm.get(termo) ?? null; // null = "A atribuir"
    const stBruto = String(l[C.status] ?? "").trim();
    const status = STATUS[semAcento(stBruto)];
    if (!status) { cont.statusIgnorado.set(stBruto || "(vazio)", (cont.statusIgnorado.get(stBruto || "(vazio)") ?? 0) + 1); continue; }
    const id = String(l[C.id] ?? "").trim();
    if (!id) { cont.semId++; continue; }
    const data = dataDe(l[C.data]);
    if (!data) { cont.semData++; continue; }
    if ((desde && data.dia < desde) || (ate && data.dia > ate)) { cont.foraPeriodo++; continue; }
    if (vistas.has(id)) { cont.repetidaNoArquivo++; continue; }
    vistas.add(id);
    if (existentes.has(id)) { cont.jaExiste++; continue; }

    const oferta = String(l[C.oferta] ?? "").trim();
    const produto = String(l[C.produto] ?? "").trim();
    // ticket = item Society/Protocolo em qualquer coluna, pelo valor − bumps (vendas-planilha-hubla.mjs)
    const p = classificar(oferta, itensDaLinha(produto, l[C.bump]), l[C.valorProduto], tickets);
    const ticket = p.ticket;
    const principalProduto = p.produto;
    const motivo = p.motivo;

    const historico = !vendedor && !!historicoAte && data.dia <= historicoAte;

    novas.push({
      venda: {
        id_fatura: id,
        vendedor_id: vendedor?.equipe_id ?? null,
        sem_vendedor: historico,
        forma_atribuicao: vendedor ? "utm" : null,
        atribuida_em: vendedor ? data.instante : null,
        utm_term: termo || null,
        ticket_id: ticket?.id ?? null,
        motivo_sem_ticket: motivo?.slice(0, 200) ?? null,
        itens: [produto && oferta ? `${produto} - ${oferta}` : produto || oferta].filter(Boolean),
        bumps: p.bumps,
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
      dono: vendedor?.equipe?.nome ?? (historico ? "histórico sem vendedor" : "A atribuir"),
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
  console.log(
    todos
      ? `Todos os vendedores${desde || ate ? ` · período ${desde ?? "início"} a ${ate ?? "hoje"}` : ""} · novas: ${novas.length} · já existiam: ${cont.jaExiste} · fora do período: ${cont.foraPeriodo} · repetidas no arquivo: ${cont.repetidaNoArquivo}`
      : `Vendedor: ${vendedorDoUtm.get(utm).equipe.nome} (utm "${utm}") · novas: ${novas.length} · já existiam: ${cont.jaExiste} · de outros/sem utm: ${cont.outro} · fora do período: ${cont.foraPeriodo}`,
  );
  const porDono = new Map();
  for (const n of novas) {
    const k = `${n.dono} · ${n.venda.status}`;
    porDono.set(k, (porDono.get(k) ?? 0) + 1);
  }
  console.log(`Novas por dono: ${[...porDono].sort().map(([k, q]) => `${q}x ${k}`).join(" · ") || "nenhuma"}`);
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
