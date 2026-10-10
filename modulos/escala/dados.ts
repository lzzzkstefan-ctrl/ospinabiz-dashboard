// Leitura da Escala e check-in, com o usuário logado (o RLS decide o que cada um vê).

import { createClient } from "@/lib/supabase/server";
import { diasDaSemana, instante, montarDia, presencas, somarDias, type Checkin, type DiaEscala, type Padrao, type Plantao, type Presenca } from "./regras";

export type Pessoa = { id: number; nome: string; temLogin: boolean };

export type Semana = {
  domingo: string;
  operacao: { inicio: string; fim: string };
  pessoas: Pessoa[];
  dias: DiaEscala[];
  presencas: Presenca[];
  /** plantões de hoje em diante (pendentes e decididos), para a lista de pedidos */
  plantoes: (Plantao & { nome: string })[];
  /** quem está com turno aberto agora */
  agora: { checkinId: number; equipeId: number; nome: string; tipo: Checkin["tipo"]; desde: string }[];
  /** turnos da semana (para o admin corrigir) */
  checkins: Checkin[];
  /** pessoa da equipe ligada ao login (null = login sem ninguém da equipe) */
  eu: number | null;
};

export async function carregarSemana(domingo: string, hoje: string, usuarioId: string): Promise<Semana> {
  const supabase = await createClient();
  const sabado = somarDias(domingo, 6);
  const [equipe, config, padroes, plantoesSemana, proximos, checkins, abertos] = await Promise.all([
    supabase.from("equipe").select("id, nome, usuario_id, ativo").order("nome"),
    supabase.from("funil_config").select("atendimento_inicio, atendimento_fim").maybeSingle(),
    supabase.from("escala_padrao").select("id, dia_semana, equipe_id, inicio, fim, tipo, desde, ate").lte("desde", sabado).or(`ate.is.null,ate.gte.${domingo}`),
    supabase.from("escala_plantoes").select("id, dia, equipe_id, inicio, fim, tipo, situacao, motivo").gte("dia", domingo).lte("dia", sabado),
    supabase.from("escala_plantoes").select("id, dia, equipe_id, inicio, fim, tipo, situacao, motivo").gte("dia", hoje).order("dia").order("inicio").limit(200),
    // turnos que tocam a semana (começaram antes do fim dela e não terminaram antes do começo)
    supabase
      .from("escala_checkins")
      .select("id, equipe_id, tipo, inicio, fim, encerrado_auto")
      .lt("inicio", instante(somarDias(sabado, 1), "00:00"))
      .or(`fim.is.null,fim.gte.${instante(domingo, "00:00")}`)
      .order("inicio"),
    supabase.from("escala_checkins").select("id, equipe_id, tipo, inicio").is("fim", null).order("inicio"),
  ]);
  for (const r of [equipe, padroes, plantoesSemana, proximos, checkins, abertos]) {
    if (r.error) throw new Error(`Erro ao carregar a escala: ${r.error.message}`);
  }
  const pessoas = (equipe.data ?? []).filter((p) => p.ativo).map((p) => ({ id: Number(p.id), nome: String(p.nome), temLogin: !!p.usuario_id }));
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const operacao = {
    inicio: String(config.data?.atendimento_inicio ?? "09:00").slice(0, 5),
    fim: String(config.data?.atendimento_fim ?? "22:00").slice(0, 5),
  };
  const dias = diasDaSemana(domingo).map((d) => montarDia(d, (padroes.data ?? []) as Padrao[], (plantoesSemana.data ?? []) as Plantao[], nomeDe, operacao));
  const listaCheckins = (checkins.data ?? []) as Checkin[];
  return {
    domingo,
    operacao,
    pessoas,
    dias,
    presencas: presencas(
      dias.filter((d) => d.dia <= hoje),
      listaCheckins,
      nomeDe,
      new Date().toISOString(),
    ),
    plantoes: ((proximos.data ?? []) as Plantao[]).map((p) => ({ ...p, nome: nomeDe.get(p.equipe_id) ?? "?" })),
    agora: (abertos.data ?? []).map((c) => ({ checkinId: Number(c.id), equipeId: Number(c.equipe_id), nome: nomeDe.get(Number(c.equipe_id)) ?? "?", tipo: c.tipo as Checkin["tipo"], desde: String(c.inicio) })),
    checkins: listaCheckins,
    eu: (equipe.data ?? []).find((p) => p.usuario_id === usuarioId)?.id ?? null,
  };
}

/** Escala padrão em vigor (de hoje em diante), por dia da semana, para a configuração. */
export async function escalaPadraoVigente(hoje: string): Promise<(Padrao & { nome: string })[]> {
  const supabase = await createClient();
  const [padroes, equipe] = await Promise.all([
    supabase.from("escala_padrao").select("id, dia_semana, equipe_id, inicio, fim, tipo, desde, ate").or(`ate.is.null,ate.gte.${hoje}`).order("dia_semana").order("inicio"),
    supabase.from("equipe").select("id, nome"),
  ]);
  if (padroes.error) throw new Error(`Erro ao carregar a escala padrão: ${padroes.error.message}`);
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  return ((padroes.data ?? []) as Padrao[]).map((p) => ({ ...p, nome: nomeDe.get(p.equipe_id) ?? "?" }));
}
