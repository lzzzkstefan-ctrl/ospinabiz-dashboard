// Leitura da aba Criativos. Lê com o login de quem abriu (o RLS só libera pra gestão).
// Contexto em docs/modulos/criativos.md.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Aprendizado } from "./prompt";
import { MAX_APRENDIZADOS } from "./prompt";
import { COTACAO_PADRAO, inicioDoMesSP, LIMITE_PADRAO_BRL, numeroDaEnv, situacaoGasto, type Gasto, type Modo, type Origem, type Status } from "./regras";

type Db = Awaited<ReturnType<typeof createClient>>;

export type Criativo = {
  id: number;
  titulo: string;
  status: Status;
  angulo: string | null;
  formato: string | null;
  duracao_seg: number | null;
  hook: string | null;
  subhook: string | null;
  corpo: string | null;
  cta: string | null;
  roteiro_completo: string | null;
  origem: Origem;
  pai_id: number | null;
  referencia_link: string | null;
  referencia_transcricao: string | null;
  resultado_notas: string | null;
  metricas: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
};

export type CriativoResumo = Pick<Criativo, "id" | "titulo" | "status" | "hook" | "origem" | "pai_id" | "atualizado_em"> & { variacoes: number };

export type Geracao = { id: number; modo: Modo; saida: unknown; modelo: string; custo_estimado_brl: number; criado_em: string };

export type AprendizadoDoCriativo = { id: number; tipo: "venceu" | "perdeu"; motivo: string; criado_em: string };

const CAMPOS = "id, titulo, status, angulo, formato, duracao_seg, hook, subhook, corpo, cta, roteiro_completo, origem, pai_id, referencia_link, referencia_transcricao, resultado_notas, metricas, criado_em, atualizado_em";

function erro(onde: string, e: { message: string } | null): void {
  if (e) throw new Error(`Erro ao carregar ${onde}: ${e.message}`);
}

const criativoDe = (c: Record<string, unknown>): Criativo => ({ ...(c as Criativo), id: Number(c.id), pai_id: c.pai_id == null ? null : Number(c.pai_id), metricas: (c.metricas as Record<string, unknown>) ?? {} });

/** Limite do mês em reais (CRIATIVOS_LIMITE_MENSAL_BRL, padrão R$ 100). */
export const limiteMensalBRL = () => numeroDaEnv(process.env.CRIATIVOS_LIMITE_MENSAL_BRL, LIMITE_PADRAO_BRL);
/** Cotação do dólar só pra estimativa (CRIATIVOS_COTACAO_DOLAR, padrão 6). */
export const cotacaoDolar = () => numeroDaEnv(process.env.CRIATIVOS_COTACAO_DOLAR, COTACAO_PADRAO);

/** Quanto já foi gasto com a IA neste mês (horário de Brasília) e o limite. */
export async function gastoDoMes(db?: Db): Promise<Gasto> {
  const banco = db ?? (await createClient());
  const { data, error } = await banco.from("criativo_geracoes").select("custo_estimado_brl").gte("criado_em", inicioDoMesSP());
  erro("o gasto do mês", error);
  const usado = (data ?? []).reduce((s, g) => s + Number(g.custo_estimado_brl ?? 0), 0);
  return situacaoGasto(usado, limiteMensalBRL());
}

/** Todos os criativos (mais recentes primeiro) com quantas variações cada um tem. */
export async function listarCriativos(): Promise<CriativoResumo[]> {
  const db = await createClient();
  const { data, error } = await db.from("criativos").select("id, titulo, status, hook, origem, pai_id, atualizado_em").order("atualizado_em", { ascending: false });
  erro("os criativos", error);
  const lista = (data ?? []).map((c) => ({ ...c, id: Number(c.id), pai_id: c.pai_id == null ? null : Number(c.pai_id) })) as Omit<CriativoResumo, "variacoes">[];
  const filhos = new Map<number, number>();
  for (const c of lista) if (c.pai_id != null) filhos.set(c.pai_id, (filhos.get(c.pai_id) ?? 0) + 1);
  return lista.map((c) => ({ ...c, variacoes: filhos.get(c.id) ?? 0 }));
}

export type CriativoCompleto = {
  criativo: Criativo;
  pai: Pick<Criativo, "id" | "titulo"> | null;
  filhos: CriativoResumo[];
  geracoes: Geracao[];
  aprendizados: AprendizadoDoCriativo[];
};

export async function carregarCriativo(id: number): Promise<CriativoCompleto | null> {
  const db = await createClient();
  const { data, error } = await db.from("criativos").select(CAMPOS).eq("id", id).maybeSingle();
  erro("o criativo", error);
  if (!data) return null;
  const criativo = criativoDe(data);
  const [pai, filhos, geracoes, aprendizados] = await Promise.all([
    criativo.pai_id ? db.from("criativos").select("id, titulo").eq("id", criativo.pai_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db.from("criativos").select("id, titulo, status, hook, origem, pai_id, atualizado_em").eq("pai_id", id).order("criado_em"),
    db.from("criativo_geracoes").select("id, modo, saida, modelo, custo_estimado_brl, criado_em").eq("criativo_id", id).order("criado_em", { ascending: false }).limit(30),
    db.from("criativo_aprendizados").select("id, tipo, motivo, criado_em").eq("criativo_id", id).order("criado_em", { ascending: false }),
  ]);
  erro("o criativo de origem", pai.error);
  erro("as variações", filhos.error);
  erro("o histórico de gerações", geracoes.error);
  erro("os aprendizados", aprendizados.error);
  return {
    criativo,
    pai: pai.data ? { id: Number(pai.data.id), titulo: String(pai.data.titulo) } : null,
    filhos: (filhos.data ?? []).map((f) => ({ ...(f as Omit<CriativoResumo, "variacoes">), id: Number(f.id), pai_id: id, variacoes: 0 })),
    geracoes: (geracoes.data ?? []).map((g) => ({ ...(g as Geracao), id: Number(g.id), custo_estimado_brl: Number(g.custo_estimado_brl) })),
    aprendizados: (aprendizados.data ?? []).map((a) => ({ ...(a as AprendizadoDoCriativo), id: Number(a.id) })),
  };
}

/** Criativo cru (pro gerador), com o login de quem pediu. */
export async function criativoPorId(db: Db, id: number): Promise<Criativo | null> {
  const { data, error } = await db.from("criativos").select(CAMPOS).eq("id", id).maybeSingle();
  erro("o criativo", error);
  return data ? criativoDe(data) : null;
}

/** Últimos aprendizados (venceu/perdeu + motivo) com o criativo de cada um, pro system prompt. */
export async function ultimosAprendizados(db: Db): Promise<Aprendizado[]> {
  const { data, error } = await db
    .from("criativo_aprendizados")
    .select("tipo, motivo, criado_em, criativos(titulo, angulo, hook)")
    .order("criado_em", { ascending: false })
    .limit(MAX_APRENDIZADOS);
  erro("os aprendizados", error);
  return (data ?? []).map((a) => {
    const c = (Array.isArray(a.criativos) ? a.criativos[0] : a.criativos) as { titulo?: string; angulo?: string | null; hook?: string | null } | null;
    return { tipo: a.tipo as Aprendizado["tipo"], motivo: String(a.motivo), criado_em: String(a.criado_em), titulo: c?.titulo ?? null, angulo: c?.angulo ?? null, hook: c?.hook ?? null };
  });
}
