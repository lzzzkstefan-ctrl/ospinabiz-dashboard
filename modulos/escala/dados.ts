// Leitura do Check-in (escala), com o usuário logado (o RLS decide o que cada um vê).
// Plantões extras saíram da tela em 10/10/2026 (pedido do Davi); a tabela continua no banco, sem uso.

import { createClient } from "@/lib/supabase/server";
import { diasDaSemana, emBrasilia, instante, montarDia, presencas, somarDias, type Checkin, type DiaEscala, type MotivoPausa, type Padrao, type Pausa, type Presenca } from "./regras";

export type Pessoa = { id: number; nome: string; temLogin: boolean };
/** Quem está na operação agora; `pausa` preenchida = em pausa (desde, motivo, minutos até agora). */
export type Online = {
  checkinId: number;
  equipeId: number;
  nome: string;
  desde: string;
  pausa: { motivo: MotivoPausa; detalhe: string | null; desde: string; minutos: number } | null;
};

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
};

/**
 * Online agora + pausas abertas (usado aqui e no Início). Pessoa de teste (equipe.teste) só aparece
 * para ela mesma.
 */
async function onlineAgora(nomeDe: Map<number, string>, testes: Set<number>, eu: number | null): Promise<Online[]> {
  const supabase = await createClient();
  const [abertos, pausas] = await Promise.all([
    supabase.from("escala_checkins").select("id, equipe_id, inicio").is("fim", null).order("inicio"),
    supabase.from("escala_pausas").select("checkin_id, motivo, detalhe, inicio").is("fim", null),
  ]);
  const agora = Date.now();
  return (abertos.data ?? []).filter((c) => !testes.has(Number(c.equipe_id)) || Number(c.equipe_id) === eu).map((c) => {
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

export async function carregarSemana(domingo: string, usuarioId: string): Promise<Semana> {
  const supabase = await createClient();
  const sabado = somarDias(domingo, 6);
  const comeco = instante(domingo, "00:00");
  const fimDaSemana = instante(somarDias(sabado, 1), "00:00");
  const [equipe, config, padroes, checkins, pausas, primeiro, limite] = await Promise.all([
    supabase.from("equipe").select("id, nome, usuario_id, ativo, teste").order("nome"),
    supabase.from("funil_config").select("atendimento_inicio, atendimento_fim").maybeSingle(),
    supabase.from("escala_padrao").select("id, dia_semana, equipe_id, inicio, fim, tipo, desde, ate").lte("desde", sabado).or(`ate.is.null,ate.gte.${domingo}`),
    // entradas que tocam a semana (começaram antes do fim dela e não terminaram antes do começo)
    supabase.from("escala_checkins").select("id, equipe_id, tipo, inicio, fim, encerrado_auto").lt("inicio", fimDaSemana).or(`fim.is.null,fim.gte.${comeco}`).order("inicio"),
    supabase.from("escala_pausas").select("id, checkin_id, equipe_id, motivo, detalhe, inicio, fim, encerrada_com_saida").lt("inicio", fimDaSemana).or(`fim.is.null,fim.gte.${comeco}`),
    // primeiro check-in registrado: antes dele o check-in não existia ("—" em vez de "não entrou")
    supabase.from("escala_checkins").select("inicio").order("inicio").limit(1).maybeSingle(),
    pausaLonga(),
  ]);
  for (const r of [equipe, padroes, checkins, pausas]) {
    if (r.error) throw new Error(`Erro ao carregar o check-in: ${r.error.message}`);
  }
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const operacao = {
    inicio: String(config.data?.atendimento_inicio ?? "09:00").slice(0, 5),
    fim: String(config.data?.atendimento_fim ?? "22:00").slice(0, 5),
  };
  const dias = diasDaSemana(domingo).map((d) => montarDia(d, (padroes.data ?? []) as Padrao[], [], nomeDe, operacao));
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
    presencas: presencas(dias, (checkins.data ?? []) as Checkin[], (pausas.data ?? []) as Pausa[], nomeDe, new Date().toISOString(), primeiroDia).filter((p) => visivel(p.equipeId)),
    agora: await onlineAgora(nomeDe, testes, eu),
    eu,
    pausaLongaMin: limite,
  };
}

/** Só o necessário para o botão "Entrei na operação" e a lista de quem está online (Início). */
export async function operacaoAgora(usuarioId: string): Promise<{ eu: number | null; agora: Online[]; pausaLongaMin: number }> {
  const supabase = await createClient();
  const { data: equipe } = await supabase.from("equipe").select("id, nome, usuario_id, teste");
  const nomeDe = new Map((equipe ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const testes = new Set((equipe ?? []).filter((p) => p.teste).map((p) => Number(p.id)));
  const eu = (equipe ?? []).find((p) => p.usuario_id === usuarioId)?.id ?? null;
  const [agora, limite] = await Promise.all([onlineAgora(nomeDe, testes, eu), pausaLonga()]);
  return { eu, agora, pausaLongaMin: limite };
}
