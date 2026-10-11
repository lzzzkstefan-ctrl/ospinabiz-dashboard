// Gera docs/backlog.md e docs/changelog.md a partir da aba Melhorias (a fonte é o banco).
// Rodar antes de cada push (regra no CLAUDE.md). Também marca um item como feito:
//
//   npm run melhorias:docs
//   npm run melhorias:docs -- --feito=<id> --linha="Funil: ... (linha que vai para Novidades)"
//   npm run melhorias:docs -- --novo="Título" --aba=Funil --prioridade=media   (cria em "Para fazer")
//
// Usa a chave secreta (.env.local): só local, nunca no navegador.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

try {
  const feito = arg("feito");
  if (feito) {
    const linha = arg("linha")?.trim() || null;
    const r = ok(await db.from("melhorias").update({ status: "feito", novidade: linha }).eq("id", Number(feito)).select("titulo"));
    if (!r.length) throw new Error(`melhoria ${feito} não existe`);
    console.log(`feito: ${r[0].titulo}`);
  }
  const novo = arg("novo");
  if (novo) {
    const r = ok(
      await db
        .from("melhorias")
        .insert({ titulo: novo.trim(), aba: arg("aba") ?? null, prioridade: arg("prioridade") ?? "media", status: "fazer", sugerido_nome: "Davi" })
        .select("id"),
    );
    console.log(`criada: #${r[0].id} ${novo}`);
  }

  const itens = ok(await db.from("melhorias").select("id, titulo, descricao, status, prioridade, aba, sugerido_nome, feito_em, novidade, criado_em"));
  const peso = { alta: 0, media: 1, baixa: 2 };
  const nomePrioridade = { alta: "alta", media: "média", baixa: "baixa" };
  const dataBR = (iso) => {
    const d = new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10);
    return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  };
  const colunas = [
    ["andamento", "Em andamento"],
    ["fazer", "Para fazer"],
    ["ideia", "Ideia"],
  ];

  let backlog = "# Backlog da dashboard\n\n";
  backlog += "Gerado da aba Melhorias (`npm run melhorias:docs`). Não editar à mão: mude na aba e rode o script.\n";
  backlog += "O que já foi entregue está em `docs/changelog.md`.\n";
  for (const [id, nome] of colunas) {
    const lista = itens.filter((m) => m.status === id).sort((a, b) => peso[a.prioridade] - peso[b.prioridade] || a.criado_em.localeCompare(b.criado_em));
    backlog += `\n## ${nome} (${lista.length})\n\n`;
    if (!lista.length) backlog += "_Nada._\n";
    for (const m of lista) {
      backlog += `- **${m.titulo}** · ${nomePrioridade[m.prioridade]}${m.aba ? ` · ${m.aba}` : ""}${m.sugerido_nome ? ` · sugerido por ${m.sugerido_nome}` : ""} (#${m.id})\n`;
      if (m.descricao) backlog += `  ${m.descricao.replace(/\s*\n\s*/g, " ")}\n`;
    }
  }

  const feitos = itens.filter((m) => m.status === "feito" && m.feito_em).sort((a, b) => b.feito_em.localeCompare(a.feito_em));
  let changelog = "# Novidades da dashboard\n\n";
  changelog += "Gerado da aba Melhorias (coluna Feito, `npm run melhorias:docs`). Não editar à mão.\n";
  let dia = null;
  for (const m of feitos) {
    const d = dataBR(m.feito_em);
    if (d !== dia) {
      changelog += `\n## ${d}\n\n`;
      dia = d;
    }
    changelog += `- ${m.novidade ?? m.titulo}\n`;
  }
  if (!feitos.length) changelog += "\n_Nada entregue ainda._\n";

  writeFileSync("docs/backlog.md", backlog);
  writeFileSync("docs/changelog.md", changelog);
  console.log(`docs/backlog.md (${itens.length - feitos.length} itens) e docs/changelog.md (${feitos.length} novidades) gerados`);
} catch (e) {
  console.error("Erro:", e.message);
  process.exit(1);
}
