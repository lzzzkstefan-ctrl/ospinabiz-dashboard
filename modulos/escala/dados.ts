// Leitura do Check-in (escala), com o usuário logado (o RLS decide o que cada um vê).
// Plantões extras saíram da tela em 10/10/2026 (pedido do Davi); a tabela continua no banco, sem uso.

import { createClient } from "@/lib/supabase/server";
import { escaladosNoDia, hojePergunta, textoPergunta, type TipoFeriado } from "./feriados";
import {
  COLUNAS_COMPROMISSO,
  diasDaSemana,
  emBrasilia,
  instante,
  montarDia,
  presencas,
  somarDias,
  type Checkin,
  type Compromisso,
  type DiaEscala,
  type MotivoPausa,
  type Padrao,
  type Pausa,
  type Presenca,
} from "./regras";

export type Pessoa = { id: number; nome: string; temLogin: boolean };
/** Quem está na operação agora; `pausa` preenchida = em pausa (desde, motivo, minutos até agora). */
export type Online = {
  checkinId: number;
  equipeId: number;
  nome: string;
  desde: string;
  pausa: { motivo: MotivoPausa; detalhe: string | null; desde: string; minutos: number } | null;
};

/** Feriado de um dia da semana. roda: true = vai rodar, false = folga, null = sem decisão. */
export type FeriadoDoDia = { id: number; nome: string; tipo: TipoFeriado; manual: boolean; roda: boolean | null; precisaDecidir: boolean; teste: boolean };

export type Semana = {
  domingo: string;
  operacao: { inicio: string; fim: string };
  pessoas: Pessoa[];
  dias: DiaEscala[];
  /** previsto x realizado de cada pessoa em cada dia da semana (dias futuros: "ainda não começou") */
  presencas: Presenca[];
  /** quem está online (na operação) agora */
  agora: Online[];
  /** pessoa da equipe ligada ao login (null = login sem ninguém da equipe) */
  eu: number | null;
  /** a partir de quantos minutos a pausa é longa (destaque em vermelho) */
  pausaLongaMin: number;
  /** feriados da semana, por dia ("AAAA-MM-DD") */
  feriados: Record<string, FeriadoDoDia>;
  /** compromissos previstos da semana (não cancelados), para o card do dia */
  compromissos: Compromisso[];
};

/**
 * Online agora + pausas abertas (usado aqui e no Início). `ocultos` = pessoas de teste que quem vê
 * não deve ver (ela mesma sempre se vê).
 */
async function onlineAgora(nomeDe: Map<number, string>, ocultos: Set<number>, eu: number | null): Promise<Online[]> {
  const supabase = await createClient();
  const [abertos, pausas] = await Promise.all([
    supabase.from("escala_checkins").select("id, equipe_id, inicio").is("fim", null).order("inicio"),
    supabase.from("escala_pausas").select("checkin_id, motivo, detalhe, inicio").is("fim", null),
  ]);
  const agora = Date.now();
  return (abertos.data ?? []).filter((c) => !ocultos.has(Number(c.equipe_id)) || Number(c.equipe_id) === eu).map((c) => {
    const p = (pausas.data ?? []).find((x) => Number(x.checkin_id) === Number(c.id));
    return {
      checkinId: Number(c.id),
      equipeId: Number(c.equipe_id),
      nome: nomeDe.get(Number(c.equipe_id)) ?? "?",
      desde: String(c.inicio),
      pausa: p ? { motivo: p.motivo as MotivoPausa, detalhe: p.detalhe, desde: String(p.inicio), minutos: Math.max(0, Math.floor((agora - Date.parse(String(p.inicio))) / 60_000)) } : null,
    };
  });
}

async function pausaLonga(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("escala_config").select("pausa_longa_min").maybeSingle();
  return Number(data?.pausa_longa_min ?? 30);
}

/**
 * Quem fica fora do "Online agora" de quem está vendo: pessoas de teste, menos as "visíveis"
 * (equipe.teste_visivel, para testar notificações) quando quem vê é admin.
 */
function ocultosPara(equipe: { id: unknown; teste?: boolean | null; teste_visivel?: boolean | null }[], admin: boolean): Set<number> {
  return new Set(equipe.filter((p) => p.teste && !(admin && p.teste_visivel)).map((p) => Number(p.id)));
}

export async function carregarSemana(domingo: string, usuarioId: string, admin = false): Promise<Semana> {
  const supabase = await createClient();
  const sabado = somarDias(domingo, 6);
  const comeco = instante(domingo, "00:00");
  const fimDaSemana = instante(somarDias(sabado, 1), "00:00");
  const [equipe, config, padroes, checkins, pausas, primeiro, limite, feriados, compromissos] = await Promise.all([
    supabase.from("equipe").select("id, nome, usuario_id, ativo, teste, teste_visivel").order("nome"),
    supabase.from("funil_config").select("atendimento_inicio, atendimento_fim").maybeSingle(),
    supabase.from("escala_padrao").select("id, dia_semana, equipe_id, inicio, fim, tipo, desde, ate").lte("desde", sabado).or(`ate.is.null,ate.gte.${domingo}`),
    // entradas que tocam a semana (começaram antes do fim dela e não terminaram antes do começo)
    supabase.from("escala_checkins").select("id, equipe_id, tipo, inicio, fim, encerrado_auto").lt("inicio", fimDaSemana).or(`fim.is.null,fim.gte.${comeco}`).order("inicio"),
    supabase.from("escala_pausas").select("id, checkin_id, equipe_id, motivo, detalhe, inicio, fim, encerrada_com_saida").lt("inicio", fimDaSemana).or(`fim.is.null,fim.gte.${comeco}`),
    // primeiro check-in registrado: antes dele o check-in não existia ("—" em vez de "não entrou")
    supabase.from("escala_checkins").select("inicio").order("inicio").limit(1).maybeSingle(),
    pausaLonga(),
    supabase.from("feriados").select("id, data, nome, tipo, fonte, roda, teste").gte("data", domingo).lte("data", sabado),
    supabase.from("compromissos").select(COLUNAS_COMPROMISSO).gte("data", domingo).lte("data", sabado).eq("cancelado", false).returns<Compromisso[]>(),
  ]);
  for (const r of [equipe, padroes, checkins, pausas, compromissos]) {
    if (r.error) throw new Error(`Erro ao carregar o check-in: ${r.error.message}`);
  }
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const operacao = {
    inicio: String(config.data?.atendimento_inicio ?? "09:00").slice(0, 5),
    fim: String(config.data?.atendimento_fim ?? "22:00").slice(0, 5),
  };
  const daSemana = (compromissos.data ?? []).map((c) => ({ ...c, pessoa: Number(c.pessoa), inicio: c.inicio?.slice(0, 5) ?? null, fim: c.fim?.slice(0, 5) ?? null }));
  // "Dia inteiro fora": a pessoa continua no card, mas não cobre o dia (sem mais ninguém, descoberto)
  const foraDoDia = (dia: string) => new Set(daSemana.filter((c) => c.data === dia && c.tipo === "dia_inteiro").map((c) => c.pessoa));
  const dias = diasDaSemana(domingo).map((d) => montarDia(d, (padroes.data ?? []) as Padrao[], [], nomeDe, operacao, foraDoDia(d)));
  const primeiroDia = primeiro.data?.inicio ? emBrasilia(String(primeiro.data.inicio)).dia : null;
  // pessoa de teste: fora dos horários fixos e dos cards/online dos outros (ela vê os próprios)
  const testes = new Set((equipe.data ?? []).filter((p) => p.teste).map((p) => Number(p.id)));
  const eu = (equipe.data ?? []).find((p) => p.usuario_id === usuarioId)?.id ?? null;
  const visivel = (id: number) => !testes.has(id) || id === eu;
  return {
    domingo,
    operacao,
    pessoas: (equipe.data ?? []).filter((p) => p.ativo && !p.teste).map((p) => ({ id: Number(p.id), nome: String(p.nome), temLogin: !!p.usuario_id })),
    dias,
    presencas: presencas(dias, (checkins.data ?? []) as Checkin[], (pausas.data ?? []) as Pausa[], nomeDe, new Date().toISOString(), primeiroDia, daSemana).filter((p) => visivel(p.equipeId)),
    agora: await onlineAgora(nomeDe, ocultosPara(equipe.data ?? [], admin), eu),
    eu,
    pausaLongaMin: limite,
    compromissos: daSemana.filter((c) => visivel(c.pessoa)),
    feriados: Object.fromEntries(
      (feriados.data ?? []).map((f) => [
        String(f.data),
        {
          id: Number(f.id),
          nome: String(f.nome),
          tipo: f.tipo as TipoFeriado,
          manual: f.fonte === "manual",
          roda: f.roda as boolean | null,
          // só pergunta se alguém tem horário fixo no dia
          precisaDecidir: escaladosNoDia((padroes.data ?? []) as Padrao[], (equipe.data ?? []).map((p) => ({ id: Number(p.id), nome: String(p.nome), ativo: !!p.ativo, teste: !!p.teste })), String(f.data)).length > 0,
          teste: !!f.teste,
        },
      ]),
    ),
  };
}

/** Só o necessário para o botão "Entrei na operação" e a lista de quem está online (Início). */
export async function operacaoAgora(usuarioId: string, admin = false): Promise<{ eu: number | null; agora: Online[]; pausaLongaMin: number }> {
  const supabase = await createClient();
  const { data: equipe } = await supabase.from("equipe").select("id, nome, usuario_id, teste, teste_visivel");
  const nomeDe = new Map((equipe ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const eu = (equipe ?? []).find((p) => p.usuario_id === usuarioId)?.id ?? null;
  const [agora, limite] = await Promise.all([onlineAgora(nomeDe, ocultosPara(equipe ?? [], admin), eu), pausaLonga()]);
  return { eu, agora, pausaLongaMin: limite };
}

/**
 * Pop-up do feriado (só admin): o feriado de hoje ou amanhã que ainda espera decisão, se já é hora de
 * perguntar (véspera a partir das 9h). Feriado de teste: só para quem o criou.
 */
export async function perguntaFeriado(usuarioId: string): Promise<{ id: number; texto: string } | null> {
  const supabase = await createClient();
  const agora = emBrasilia(new Date().toISOString());
  const { data: feriados } = await supabase
    .from("feriados")
    .select("id, data, nome, roda, teste, criado_por")
    .is("roda", null)
    .gte("data", agora.dia)
    .lte("data", somarDias(agora.dia, 1))
    .order("data");
  const candidatos = (feriados ?? []).filter((f) => !f.teste || f.criado_por === usuarioId);
  if (!candidatos.length) return null;
  const [equipe, padroes] = await Promise.all([
    supabase.from("equipe").select("id, nome, ativo, teste"),
    supabase.from("escala_padrao").select("id, dia_semana, equipe_id, inicio, fim, tipo, desde, ate"),
  ]);
  const pessoas = (equipe.data ?? []).map((p) => ({ id: Number(p.id), nome: String(p.nome), ativo: !!p.ativo, teste: !!p.teste }));
  for (const f of candidatos) {
    const f2 = { data: String(f.data), nome: String(f.nome), roda: f.roda as boolean | null };
    if (hojePergunta(f2, escaladosNoDia((padroes.data ?? []) as Padrao[], pessoas, f2.data).length > 0, agora.dia, agora.minuto)) {
      return { id: Number(f.id), texto: textoPergunta(f2, agora.dia) };
    }
  }
  return null;
}

/** Seção "Compromissos previstos": de hoje em diante e os anteriores (últimos 60 dias), sem os cancelados. */
export async function carregarCompromissos(hoje: string): Promise<{ proximos: Compromisso[]; anteriores: Compromisso[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compromissos")
    .select(COLUNAS_COMPROMISSO)
    .eq("cancelado", false)
    .gte("data", somarDias(hoje, -60))
    .order("data")
    .order("inicio", { nullsFirst: true })
    .returns<Compromisso[]>();
  if (error) throw new Error(`Erro ao carregar os compromissos: ${error.message}`);
  const lista = (data ?? []).map((c) => ({ ...c, pessoa: Number(c.pessoa), inicio: c.inicio?.slice(0, 5) ?? null, fim: c.fim?.slice(0, 5) ?? null }));
  return { proximos: lista.filter((c) => c.data >= hoje), anteriores: lista.filter((c) => c.data < hoje).reverse() };
}
