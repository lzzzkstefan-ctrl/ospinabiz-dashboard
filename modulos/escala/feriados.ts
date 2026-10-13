// Feriados do Check-in e a decisão "a operação roda?" (pedido do Davi, 13/10/2026).
// - Nacionais vêm da BrasilAPI (carregados quando o ano atual ou o próximo faltam na tabela);
//   estaduais, municipais e pontos facultativos o admin cadastra.
// - Véspera, a partir das 9h: pop-up para o admin (layout do painel) + push. Só pergunta se alguém tem
//   horário fixo no dia do feriado (sábado sem escala, por exemplo, não pergunta).
// - Decidiu: mensagem de WhatsApp para cada pessoa com horário fixo no dia (envios).
// - 20h da véspera sem decisão: lembrete por WhatsApp para os admins. Nada vai para a equipe sem decisão.
// - "Não vai rodar": o dia vira folga; nada conta como não entrou, atraso ou descoberto.
// Contexto em docs/modulos/escala.md ("Feriados").

import { buscarFeriadosNacionais } from "@/lib/integracoes/brasilapi";
import { enviarAvisoWhatsApp, type EnvioWhatsApp } from "@/lib/integracoes/meta";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisar } from "./alertas";
import { diaDaSemana, emBrasilia, horaCurta, NOME_DIA, padraoVale, somarDias, type Padrao } from "./regras";

export type TipoFeriado = "nacional" | "estadual" | "municipal" | "manual";
export const NOME_TIPO_FERIADO: Record<TipoFeriado, string> = {
  nacional: "Nacional",
  estadual: "Estadual (SP)",
  municipal: "Municipal",
  manual: "Ponto facultativo / outro",
};

/** Para quem a mensagem da decisão foi (telefone sempre mascarado). */
export type EnvioFeriado = { nome: string; numero: string | null; situacao: EnvioWhatsApp["situacao"] | "sem_numero"; detalhe?: string };

export type Feriado = {
  id: number;
  data: string;
  nome: string;
  tipo: TipoFeriado;
  fonte: "brasilapi" | "manual";
  roda: boolean | null;
  mensagem_extra: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
  envios: EnvioFeriado[] | null;
  lembrete_em: string | null;
  teste: boolean;
  criado_por: string | null;
};

export const COLUNAS_FERIADO = "id, data, nome, tipo, fonte, roda, mensagem_extra, decidido_por, decidido_em, envios, lembrete_em, teste, criado_por";

/** A partir de que hora da véspera o admin é perguntado (minutos do dia, Brasília). */
export const PERGUNTA_A_PARTIR_MIN = 9 * 60;
/** Hora do lembrete por WhatsApp se ninguém decidiu (minutos do dia, Brasília). */
export const LEMBRETE_MIN = 20 * 60;

type Db = ReturnType<typeof createAdminClient>;
type PessoaEquipe = { id: number; nome: string; ativo: boolean; teste: boolean };
/** Quem tem horário fixo no dia, com a faixa (do primeiro início ao último fim). */
export type Escalado = { equipeId: number; nome: string; inicio: string; fim: string };

const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const mascarar = (n: string) => (n.length > 7 ? `${n.slice(0, 4)}****${n.slice(-3)}` : "****");

/** Pessoas (reais e ativas) com horário fixo no dia. */
export function escaladosNoDia(padroes: Padrao[], equipe: PessoaEquipe[], dia: string): Escalado[] {
  const pessoas = new Map(equipe.filter((p) => p.ativo && !p.teste).map((p) => [p.id, p.nome]));
  const porPessoa = new Map<number, Escalado>();
  for (const p of padroes.filter((p) => padraoVale(p, dia) && pessoas.has(Number(p.equipe_id)))) {
    const id = Number(p.equipe_id);
    const atual = porPessoa.get(id);
    const ini = p.inicio.slice(0, 5);
    const fim = p.fim.slice(0, 5);
    porPessoa.set(id, atual ? { ...atual, inicio: ini < atual.inicio ? ini : atual.inicio, fim: fim > atual.fim ? fim : atual.fim } : { equipeId: id, nome: pessoas.get(id)!, inicio: ini, fim });
  }
  return [...porPessoa.values()].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.nome.localeCompare(b.nome));
}

/**
 * O pop-up deve aparecer agora? Sem decisão, alguém escalado no dia e: véspera a partir das 9h, ou o
 * próprio dia (se a véspera passou sem decisão).
 */
export function hojePergunta(f: Pick<Feriado, "data" | "roda">, temEscalado: boolean, hoje: string, minutoAgora: number): boolean {
  if (f.roda !== null || !temEscalado) return false;
  if (f.data === hoje) return true;
  return somarDias(f.data, -1) === hoje && minutoAgora >= PERGUNTA_A_PARTIR_MIN;
}

const quando = (f: Pick<Feriado, "data">, hoje: string) => (f.data === hoje ? "Hoje" : "Amanhã");

export function textoPergunta(f: Pick<Feriado, "data" | "nome">, hoje: string): string {
  return `${quando(f, hoje)} (${NOME_DIA[diaDaSemana(f.data)].toLowerCase()}, ${dataBR(f.data)}) é feriado: ${f.nome}. A operação vai rodar?`;
}

export function textoMensagem(f: Pick<Feriado, "data" | "nome" | "roda" | "mensagem_extra">, pessoa: Escalado, hoje: string): string {
  const q = quando(f, hoje);
  const extra = f.mensagem_extra?.trim() ? ` ${f.mensagem_extra.trim()}` : "";
  return f.roda
    ? `Oi, ${pessoa.nome}! ${q} (${dataBR(f.data)}) é feriado de ${f.nome}, mas a operação vai rodar normal, no seu horário de ${horaCurta(pessoa.inicio)}–${horaCurta(pessoa.fim)}.${extra}`
    : `Oi, ${pessoa.nome}! ${q} (${dataBR(f.data)}) é feriado de ${f.nome} e a operação não vai rodar. Bom descanso!${extra}`;
}

export function textoLembrete(f: Pick<Feriado, "data" | "nome">, hoje: string): string {
  return `Ainda falta decidir se a operação roda ${quando(f, hoje).toLowerCase()} (${f.nome}). Abra a dashboard para decidir.`;
}

/** Carrega da BrasilAPI os anos que ainda não têm nenhum feriado nacional na tabela. */
export async function carregarAnosQueFaltam(db: Db, anos: number[]): Promise<number[]> {
  const carregados: number[] = [];
  for (const ano of anos) {
    const { count } = await db.from("feriados").select("id", { count: "exact", head: true }).eq("fonte", "brasilapi").gte("data", `${ano}-01-01`).lte("data", `${ano}-12-31`);
    if (count) continue;
    const lista = await buscarFeriadosNacionais(ano);
    // dia que já tem feriado manual fica como está
    const { error } = await db
      .from("feriados")
      .upsert(lista.map((f) => ({ data: f.date, nome: f.name.slice(0, 80), tipo: "nacional", fonte: "brasilapi" })), { onConflict: "data", ignoreDuplicates: true });
    if (error) throw new Error(`Feriados ${ano}: ${error.message}`);
    carregados.push(ano);
  }
  return carregados;
}

async function equipeEPadroes(db: Db) {
  const [equipe, padroes] = await Promise.all([
    db.from("equipe").select("id, nome, ativo, teste, usuario_id"),
    db.from("escala_padrao").select("id, dia_semana, equipe_id, inicio, fim, tipo, desde, ate"),
  ]);
  return {
    equipe: (equipe.data ?? []).map((p) => ({ id: Number(p.id), nome: String(p.nome), ativo: !!p.ativo, teste: !!p.teste, usuarioId: p.usuario_id as string | null })),
    padroes: (padroes.data ?? []) as Padrao[],
  };
}

async function numerosDe(db: Db, ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const { data } = await db.from("equipe_whatsapp").select("equipe_id, whatsapp").in("equipe_id", ids);
  return new Map((data ?? []).map((r) => [Number(r.equipe_id), String(r.whatsapp)]));
}

/** Admins da dashboard (quem recebe o lembrete). Feriado de teste: só quem criou. */
async function admins(db: Db, equipe: { id: number; nome: string; usuarioId: string | null }[], f: Feriado) {
  const { data } = await db.auth.admin.listUsers({ perPage: 200 });
  const ids = new Set((data?.users ?? []).filter((u) => (u.app_metadata as { papel?: string })?.papel === "admin").map((u) => u.id));
  return equipe.filter((p) => p.usuarioId && ids.has(p.usuarioId) && (!f.teste || p.usuarioId === f.criado_por));
}

/**
 * Depois da decisão: manda a mensagem para cada pessoa com horário fixo no dia e grava em `envios`.
 * Feriado de teste: só para a pessoa da equipe ligada a quem decidiu.
 */
export async function enviarMensagensDaDecisao(feriadoId: number, hoje: string): Promise<EnvioFeriado[]> {
  const db = createAdminClient();
  const { data } = await db.from("feriados").select(COLUNAS_FERIADO).eq("id", feriadoId).maybeSingle();
  const f = data as Feriado | null;
  if (!f || f.roda === null) return [];
  const { equipe, padroes } = await equipeEPadroes(db);
  let escalados = escaladosNoDia(padroes, equipe, f.data);
  if (f.teste) {
    const quem = equipe.find((p) => p.usuarioId && p.usuarioId === f.decidido_por);
    escalados = escalados.filter((e) => e.equipeId === quem?.id);
  }
  const numeros = await numerosDe(db, escalados.map((e) => e.equipeId));
  const envios: EnvioFeriado[] = [];
  for (const e of escalados) {
    const n = numeros.get(e.equipeId);
    if (!n) {
      envios.push({ nome: e.nome, numero: null, situacao: "sem_numero", detalhe: "sem WhatsApp cadastrado em Check-in > Pessoas" });
      continue;
    }
    const r = await enviarAvisoWhatsApp(n, textoMensagem(f, e, hoje));
    envios.push({ nome: e.nome, numero: mascarar(n), ...r });
  }
  await db.from("feriados").update({ envios }).eq("id", f.id);
  return envios;
}

/**
 * Relógio (pg_cron de hora em hora): carrega o ano que faltar, manda o push da véspera (9h) e o
 * lembrete das 20h. Idempotente: a chave única de notificacoes_enviadas segura a repetição.
 */
export async function verificarFeriados(agoraIso = new Date().toISOString()) {
  const db = createAdminClient();
  const agora = emBrasilia(agoraIso);
  const hoje = agora.dia;
  const ano = Number(hoje.slice(0, 4));
  const carregados = await carregarAnosQueFaltam(db, [ano, ano + 1]);

  const { data } = await db.from("feriados").select(COLUNAS_FERIADO).is("roda", null).gte("data", hoje).lte("data", somarDias(hoje, 1));
  const { equipe, padroes } = await equipeEPadroes(db);
  let perguntas = 0;
  let lembretes = 0;
  for (const f of (data ?? []) as Feriado[]) {
    if (!hojePergunta(f, escaladosNoDia(padroes, equipe, f.data).length > 0, hoje, agora.minuto)) continue;
    const so = f.teste ? (f.criado_por ?? undefined) : undefined;
    perguntas += await avisar(
      db,
      "feriado",
      `pergunta:${f.id}`,
      { titulo: "Feriado: a operação vai rodar?", corpo: textoPergunta(f, hoje), url: "/escala", tag: `feriado-${f.id}`, importante: true },
      { so },
    );

    // lembrete das 20h da véspera (uma vez)
    if (f.data !== hoje && agora.minuto >= LEMBRETE_MIN && !f.lembrete_em) {
      const { data: registro } = await db
        .from("notificacoes_enviadas")
        .upsert({ tipo: "feriado", chave: `lembrete:${f.id}`, titulo: "Lembrete: decidir feriado", corpo: textoLembrete(f, hoje) }, { onConflict: "tipo,chave", ignoreDuplicates: true })
        .select("id")
        .maybeSingle();
      if (!registro) continue;
      const quem = await admins(db, equipe, f);
      const numeros = await numerosDe(db, quem.map((p) => p.id));
      const resultado: EnvioFeriado[] = [];
      for (const p of quem) {
        const n = numeros.get(p.id);
        if (!n) {
          resultado.push({ nome: p.nome, numero: null, situacao: "sem_numero" });
          continue;
        }
        resultado.push({ nome: p.nome, numero: mascarar(n), ...(await enviarAvisoWhatsApp(n, textoLembrete(f, hoje))) });
      }
      const enviados = resultado.filter((r) => r.situacao === "ok").length;
      lembretes += enviados;
      await db.from("notificacoes_enviadas").update({ enviados, resultado }).eq("id", registro.id);
      await db.from("feriados").update({ lembrete_em: agoraIso }).eq("id", f.id);
    }
  }
  return { carregados, perguntas, lembretes };
}
