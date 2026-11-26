// Geração com IA da aba Criativos: uma função por modo. Cada chamada:
//   1. confere a trava de gasto do mês (CRIATIVOS_LIMITE_MENSAL_BRL);
//   2. monta o system prompt (agente + últimos aprendizados) e pede JSON no formato fixo do modo;
//   3. se o JSON vier quebrado ou cortado, pede de novo UMA vez;
//   4. grava em criativo_geracoes (entrada, saída, tokens, custo em R$), inclusive quando falha,
//      pra o gasto do mês bater com o que a Anthropic cobra.
// Grava com o login de quem clicou (RLS da gestão). Contexto em docs/modulos/criativos.md.

import "server-only";
import { custoUSD, gerarJson, somarUso, temChaveAnthropic, usoZerado, type Esforco, type UsoTokens } from "@/lib/integracoes/anthropic";
import type { createClient } from "@/lib/supabase/server";
import type { z } from "zod";
import { cotacaoDolar, criativoPorId, gastoDoMes, ultimosAprendizados, type Criativo } from "./dados";
import { AnaliseSchema, IdeiasSchema, OrganicoSchema, RoteiroSchema, SepararSchema, VariacoesSchema, type SaidaPorModo } from "./formatos";
import { montarSistema } from "./prompt";
import { reais, type Modo } from "./regras";

type Db = Awaited<ReturnType<typeof createClient>>;

export const MAX_TRANSCRICAO = 20000;

export type ResultadoGeracao<M extends Modo> =
  | { ok: true; geracaoId: number; modo: M; saida: SaidaPorModo[M]; custo: number }
  | { ok: false; erro: string; limite?: boolean };

const SCHEMAS: { [M in Modo]: z.ZodType<SaidaPorModo[M]> } = {
  variacoes: VariacoesSchema,
  ideias: IdeiasSchema,
  roteiro: RoteiroSchema,
  organico: OrganicoSchema,
  analise_referencia: AnaliseSchema,
  separar: SepararSchema,
};

const MENSAGEM: Record<string, string> = {
  json_quebrado: "A IA respondeu fora do formato duas vezes. Tenta de novo.",
  cortado: "A resposta ficou grande demais e veio cortada. Tenta de novo.",
  recusou: "A IA recusou esse pedido. Muda o texto colado e tenta de novo.",
  sem_chave: "Falta configurar a ANTHROPIC_API_KEY (ver docs/modulos/criativos.md).",
};

async function executar<M extends Modo>(
  db: Db,
  modo: M,
  opcoes: { pedido: string; entrada: string; criativoId: number | null; esforco: Esforco },
): Promise<ResultadoGeracao<M>> {
  if (!temChaveAnthropic()) return { ok: false, erro: MENSAGEM.sem_chave };
  const gasto = await gastoDoMes(db);
  if (gasto.estourou) {
    return { ok: false, limite: true, erro: `Limite do mês batido: ${reais(gasto.usado)} de ${reais(gasto.limite)}. Volta no mês que vem ou aumenta CRIATIVOS_LIMITE_MENSAL_BRL na Vercel.` };
  }

  const sistema = await montarSistema(await ultimosAprendizados(db));
  const schema = SCHEMAS[modo];
  let uso: UsoTokens = usoZerado();
  let modelo = "";
  let r = await gerarJson({ sistema, pedido: opcoes.pedido, schema, esforco: opcoes.esforco });
  uso = somarUso(uso, r.uso);
  modelo = r.modelo;
  if (!r.ok && (r.motivo === "json_quebrado" || r.motivo === "cortado")) {
    console.warn("[criativos] resposta fora do formato, pedindo de novo:", r.detalhe);
    const pedidoDeNovo = `${opcoes.pedido}\n\nATENÇÃO: a resposta anterior veio fora do formato. Responda só o JSON, completo e mais enxuto.`;
    r = await gerarJson({ sistema, pedido: pedidoDeNovo, schema, esforco: opcoes.esforco });
    uso = somarUso(uso, r.uso);
    modelo = r.modelo;
  }

  const custo = Math.round(custoUSD(uso, modelo) * cotacaoDolar() * 10000) / 10000;
  const gastou = uso.entrada + uso.saida + uso.cacheEscrita + uso.cacheLeitura > 0;
  if (!r.ok && !gastou) return { ok: false, erro: MENSAGEM[r.motivo] ?? r.detalhe };

  const { data, error } = await db
    .from("criativo_geracoes")
    .insert({
      criativo_id: opcoes.criativoId,
      modo,
      entrada: opcoes.entrada.slice(0, 60000),
      saida: r.ok ? r.dados : { erro: r.motivo, detalhe: r.detalhe },
      modelo,
      tokens_entrada: uso.entrada + uso.cacheEscrita + uso.cacheLeitura,
      tokens_saida: uso.saida,
      custo_estimado_brl: custo,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[criativos] gravar geração", error.code, error.message);
    if (r.ok) return { ok: false, erro: "A IA respondeu, mas não deu pra salvar no banco. A migration de Criativos já rodou?" };
  }
  if (!r.ok) return { ok: false, erro: MENSAGEM[r.motivo] ?? r.detalhe };
  return { ok: true, geracaoId: Number(data!.id), modo, saida: r.dados, custo };
}

// ---------------------------------------------------------------------------
// Pedaços do pedido
// ---------------------------------------------------------------------------
function descreverCriativo(c: Criativo): string {
  const campos: [string, string | number | null][] = [
    ["Título", c.titulo],
    ["Ângulo", c.angulo],
    ["Formato", c.formato],
    ["Duração (s)", c.duracao_seg],
    ["Hook", c.hook],
    ["Subhook", c.subhook],
    ["Corpo", c.corpo],
    ["CTA", c.cta],
    ["Roteiro completo", c.roteiro_completo],
    ["Notas de resultado", c.resultado_notas],
  ];
  return campos
    .filter(([, v]) => v !== null && v !== "")
    .map(([k, v]) => `${k}:\n${v}`)
    .join("\n\n");
}

const corte = (t: string) => t.trim().slice(0, MAX_TRANSCRICAO);

async function criativoOuErro(db: Db, id: number) {
  const c = await criativoPorId(db, id);
  return c ?? null;
}

// ---------------------------------------------------------------------------
// Modos
// ---------------------------------------------------------------------------

/** Modo 1: variações do criativo campeão (mantém o corpo, troca hook e subhook). */
export async function gerarVariacoes(db: Db, criativoId: number): Promise<ResultadoGeracao<"variacoes">> {
  const c = await criativoOuErro(db, criativoId);
  if (!c) return { ok: false, erro: "Criativo não encontrado." };
  if (!c.corpo?.trim()) return { ok: false, erro: "Preenche o corpo do criativo antes: as variações mantêm o corpo e trocam só o começo." };
  const texto = descreverCriativo(c);
  return executar(db, "variacoes", {
    criativoId,
    esforco: "high",
    entrada: texto,
    pedido: `MODO 1 · VARIAÇÃO DE CRIATIVO CAMPEÃO

Esse criativo está dando resultado. O hook, o subhook e o corpo já estão separados abaixo.

${texto}

Entregue:
- diagnostico: em até 3 linhas, por que ele está funcionando;
- hooks: exatamente 10 pares de hook + subhook NOVOS, de pelo menos 4 ângulos diferentes, prontos pra gravar só o começo e emendar no MESMO corpo (não reescreva o corpo). Em "angulo", o nome curto do ângulo;
- matriz_visual: exatamente 6 combinações (roupa, acessório, cenário, enquadramento, legenda, primeiro frame) que mais mudam a cara do anúncio pro algoritmo, sem mudar o texto;
- lista_gravacao: o que gravar em sequência numa única sessão de 30 minutos, um passo por item.`,
  });
}

/** Modo 2: 5 ideias novas (sem roteiro ainda). `direcao` = o que a pessoa quiser pedir (opcional). */
export async function gerarIdeias(db: Db, direcao: string): Promise<ResultadoGeracao<"ideias">> {
  const d = corte(direcao);
  return executar(db, "ideias", {
    criativoId: null,
    esforco: "high",
    entrada: d,
    pedido: `MODO 2 · IDEIAS NOVAS

${d ? `Direção do pedido de hoje:\n${d}\n\n` : ""}Me dê exatamente 5 ideias de criativo pro WhatsApp (60 a 90 s), cada uma com ângulo diferente: titulo (curto, pra achar na lista), angulo, conceito, hook, subhook, formato de gravação (o mais simples possível) e por_que pode funcionar. Não escreva o roteiro completo.`,
  });
}

/** Modo 3: roteiro completo a partir de um criativo (ideia aprovada). */
export async function gerarRoteiro(db: Db, criativoId: number): Promise<ResultadoGeracao<"roteiro">> {
  const c = await criativoOuErro(db, criativoId);
  if (!c) return { ok: false, erro: "Criativo não encontrado." };
  const texto = descreverCriativo(c);
  return executar(db, "roteiro", {
    criativoId,
    esforco: "high",
    entrada: texto,
    pedido: `MODO 3 · ROTEIRO COMPLETO

Ideia aprovada:

${texto}

Escreva o roteiro completo pro WhatsApp: nome, angulo, formato, duracao_seg (entre 60 e 90), hook principal, hooks_alternativos (exatamente 2), subhook, roteiro (as falas na ordem, com as instruções de gravação entre parênteses) e cta pro WhatsApp.${c.corpo ? " Se o corpo já existe e é de um criativo campeão, mantenha a essência dele." : ""}`,
  });
}

/** Modo 4: versão orgânica pro Instagram (hook novo, corte 30-45 s, CTA de orgânico). */
export async function gerarOrganico(db: Db, criativoId: number): Promise<ResultadoGeracao<"organico">> {
  const c = await criativoOuErro(db, criativoId);
  if (!c) return { ok: false, erro: "Criativo não encontrado." };
  if (!c.corpo?.trim() && !c.roteiro_completo?.trim()) return { ok: false, erro: "Preenche o corpo ou o roteiro antes de gerar a versão orgânica." };
  const texto = descreverCriativo(c);
  return executar(db, "organico", {
    criativoId,
    esforco: "high",
    entrada: texto,
    pedido: `MODO 4 · VERSÃO ORGÂNICA

Criativo:

${texto}

Adapte pro Instagram: hook novo pros primeiros 2 segundos, hooks_alternativos (exatamente 3), cta de orgânico ("comenta X que eu te mando", "me chama na DM" ou "link na bio"), como_cortar (o que tirar pra ficar entre 30 e 45 s) e uma legenda curta pro post.`,
  });
}

/** Análise do anúncio de outro player (link + transcrição colados à mão; nada de raspar a Biblioteca). */
export async function analisarReferencia(db: Db, link: string | null, transcricao: string): Promise<ResultadoGeracao<"analise_referencia">> {
  const t = corte(transcricao);
  if (!t) return { ok: false, erro: "Cola a transcrição do anúncio." };
  const entrada = `${link ? `Link: ${link}\n\n` : ""}Transcrição:\n${t}`;
  return executar(db, "analise_referencia", {
    criativoId: null,
    esforco: "high",
    entrada,
    pedido: `ANÚNCIO DE OUTRO PLAYER (seção 8.6)

${entrada}

Analise e devolva: hook e subhook dele, angulo, promessa, estrutura do corpo, formato de gravação, por_que_escala (por que provavelmente está escalando), adaptacao (o que dá pra adaptar pro GCS mantendo a essência, SEM copiar texto, marca ou personagem dele) e hooks_nossos: exatamente 3 hooks nossos (com subhook e ângulo) inspirados no ângulo dele.`,
  });
}

/** Separar hook, subhook e corpo de um criativo campeão colado (a pessoa confere antes de salvar). */
export async function separarCampeao(db: Db, transcricao: string): Promise<ResultadoGeracao<"separar">> {
  const t = corte(transcricao);
  if (!t) return { ok: false, erro: "Cola a transcrição do criativo." };
  return executar(db, "separar", {
    criativoId: null,
    esforco: "low",
    entrada: t,
    pedido: `SEPARAR CRIATIVO CAMPEÃO (passo 1 do Modo 1)

Transcrição de um criativo nosso que está dando resultado:

${t}

Separe sem reescrever nada (copie as falas exatamente como estão): hook, subhook (vazio se não tiver), corpo (todo o resto até o CTA) e cta (vazio se não tiver). Dê também um titulo curto pra achar na lista, o angulo e por_que_funciona em até 3 linhas.`,
  });
}
