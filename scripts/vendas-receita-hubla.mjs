// Vendas: preenche a "Receita na Hubla (com bumps)" (vendas.receita_liquida) nas vendas que JÁ
// existem, casando pelo ID da fatura. Não cria venda, não mexe em ticket nem em snap_* (a base da
// comissão não muda). Decisão do Davi, 09/10/2026: comissão sem bump; receita da operação com bump.
//
// Duas fontes:
//   --arquivo=<.xlsx>   export de faturas da Hubla (uma linha por fatura). A coluna da receita
//                        líquida é achada pelo nome (ou use --coluna="Nome exato da coluna").
//   --de-webhook        vendas que vieram pelo webhook: lê o valor do próprio evento guardado
//                        (recebedor da operação em event.invoice.receivers).
// Opções:
//   --admin="<nome na equipe>"  quem está alterando (obrigatório para venda de MÊS FECHADO: o banco
//                                registra em vendas_alteracoes com esse nome).
//   --sobrescrever              troca também a receita que já estava preenchida (padrão: só vazias).
//   --aplicar                   grava. Sem ele, só mostra a prévia (contagens e somas por mês e vendedor).
// O arquivo tem dados de clientes: deixe fora do git (pasta importar/, que o git ignora).
//
// Uso (na pasta do projeto):
//   node --env-file=.env.local scripts/vendas-receita-hubla.mjs --arquivo=importar/faturas.xlsx --admin=Davi
//   node --env-file=.env.local scripts/vendas-receita-hubla.mjs --arquivo=importar/faturas.xlsx --admin=Davi --aplicar
//   node --env-file=.env.local scripts/vendas-receita-hubla.mjs --de-webhook --aplicar

import { createClient } from "@supabase/supabase-js";
import { brl, cents, lerPlanilha, semAcento } from "./vendas-planilha-hubla.mjs";

const aplicar = process.argv.includes("--aplicar");
const sobrescrever = process.argv.includes("--sobrescrever");
const deWebhook = process.argv.includes("--de-webhook");
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const arquivo = arg("arquivo");
const colunaPedida = arg("coluna");
const nomeAdmin = arg("admin");
if (!arquivo && !deWebhook) {
  console.error("Informe --arquivo=<export .xlsx da Hubla> ou --de-webhook");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// nomes prováveis da coluna de receita líquida no export (comparados sem acento e sem maiúscula)
const CANDIDATAS = ["receita liquida", "valor liquido", "valor liquido da fatura", "liquido", "valor recebido", "valor liquido recebido"];

/** 1234.5 | "1234.5" | "1.234,50" | "R$ 1.234,50" → centavos; vazio/inválido → null */
function centavosDe(v) {
  if (typeof v === "number") return Number.isFinite(v) ? cents(v) : null;
  const t = String(v ?? "").replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? cents(n) : null;
}

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
  // 1. valores novos: id da fatura → receita líquida (centavos)
  const novos = new Map();
  let origem;
  if (deWebhook) {
    origem = "eventos do webhook";
    const eventos = await todas(() => db.from("hubla_eventos").select("id_fatura, payload").eq("tipo", "invoice.payment_succeeded").order("id"));
    for (const e of eventos) {
      const fatura = e.payload?.event?.invoice ?? {};
      const r = (fatura.receivers ?? []).find((x) => x?.id && x.id === fatura.sellerId);
      if (e.id_fatura && typeof r?.totalCents === "number") novos.set(String(e.id_fatura), r.totalCents);
    }
  } else {
    const { aba, linhas } = lerPlanilha(arquivo);
    const [cab, ...corpo] = linhas;
    const iId = cab.findIndex((h) => semAcento(h) === semAcento("ID da fatura"));
    const iRec = colunaPedida
      ? cab.findIndex((h) => semAcento(h) === semAcento(colunaPedida))
      : cab.findIndex((h) => CANDIDATAS.includes(semAcento(h)));
    if (iId < 0 || iRec < 0) {
      console.error(`Não achei a coluna ${iId < 0 ? '"ID da fatura"' : "da receita líquida"}. Colunas da aba "${aba}":\n  ${cab.join(" | ")}`);
      console.error('Rode de novo com --coluna="<nome exato da coluna>".');
      process.exit(1);
    }
    origem = `planilha (aba "${aba}", coluna "${cab[iRec]}")`;
    for (const l of corpo) {
      const id = String(l[iId] ?? "").trim();
      const c = centavosDe(l[iRec]);
      if (id && c !== null) novos.set(id, c);
    }
  }

  // 2. vendas existentes que casam
  const ids = [...novos.keys()];
  const vendas = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("vendas").select("id, id_fatura, data, vendedor_id, status, receita_liquida").in("id_fatura", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    vendas.push(...data);
  }
  const fechados = new Set((await todas(() => db.from("vendas_fechamentos").select("mes, vendedor_id").order("mes"))).map((f) => `${f.mes.slice(0, 7)}|${f.vendedor_id}`));
  const equipe = new Map((await todas(() => db.from("equipe").select("id, nome, usuario_id").order("id"))).map((p) => [p.id, p]));
  const admin = nomeAdmin ? [...equipe.values()].find((p) => semAcento(p.nome) === semAcento(nomeAdmin)) : null;
  if (nomeAdmin && !admin?.usuario_id) throw new Error(`"${nomeAdmin}" não está na equipe com login.`);

  const atualizar = vendas.filter((v) => sobrescrever || v.receita_liquida == null).filter((v) => cents(Number(v.receita_liquida ?? -1)) !== novos.get(v.id_fatura));
  const emMesFechado = atualizar.filter((v) => v.vendedor_id && fechados.has(`${v.data.slice(0, 7)}|${v.vendedor_id}`));

  // 3. prévia por mês e vendedor (só pagas entram na receita da tela; reembolsos aparecem à parte)
  console.log(`RECEITA NA HUBLA (COM BUMPS) — ${aplicar ? "APLICANDO" : "PRÉVIA (nada gravado)"} — fonte: ${origem}`);
  console.log(`faturas com valor: ${novos.size} · casaram com venda: ${vendas.length} · sem venda no banco: ${novos.size - vendas.length} · a preencher: ${atualizar.length} · em mês fechado: ${emMesFechado.length}`);
  const grupos = new Map();
  for (const v of vendas) {
    const k = `${v.data.slice(0, 7)} · ${v.vendedor_id ? equipe.get(v.vendedor_id)?.nome : "sem vendedor"}${fechados.has(`${v.data.slice(0, 7)}|${v.vendedor_id}`) ? " (fechado)" : ""}`;
    const g = grupos.get(k) ?? { pagas: 0, receitaPagas: 0, reembolsos: 0 };
    if (v.status === "pago") {
      g.pagas++;
      g.receitaPagas += novos.get(v.id_fatura);
    } else g.reembolsos++;
    grupos.set(k, g);
  }
  console.log("\nMês · vendedor                      Pagas   Receita das pagas   Reemb./CB");
  for (const [k, g] of [...grupos].sort()) console.log(`${k.padEnd(36)} ${String(g.pagas).padStart(5)}   ${brl(g.receitaPagas).padStart(17)}   ${String(g.reembolsos).padStart(9)}`);

  if (!aplicar) {
    console.log("\nPrévia: nada foi gravado. Rode com --aplicar para gravar.");
    process.exit(0);
  }
  if (emMesFechado.length && !admin) throw new Error(`${emMesFechado.length} venda(s) em mês fechado: informe --admin="<seu nome na equipe>" para o registro.`);

  let gravadas = 0;
  for (const v of atualizar) {
    const { error } = await db
      .from("vendas")
      .update({ receita_liquida: novos.get(v.id_fatura) / 100, ...(admin ? { alterado_via: "admin", alterado_por: admin.usuario_id } : {}) })
      .eq("id", v.id);
    if (error) throw new Error(`venda ${v.id}: ${error.message}`);
    gravadas++;
  }
  console.log(`\nGravado: ${gravadas} venda(s). Ticket, base da comissão e comissão não foram alterados.`);
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
}
