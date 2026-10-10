// Leitura do Check-in (escala), com o usuário logado (o RLS decide o que cada um vê).
// Plantões extras saíram da tela em 10/10/2026 (pedido do Davi); a tabela continua no banco, sem uso.

import { createClient } from "@/lib/supabase/server";
import { diasDaSemana, instante, montarDia, presencas, somarDias, type Checkin, type DiaEscala, type Padrao, type Presenca } from "./regras";

export type Pessoa = { id: number; nome: string; temLogin: boolean };
export type Online = { checkinId: number; equipeId: number; nome: string; desde: string };

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
};

export async function carregarSemana(domingo: string, usuarioId: string): Promise<Semana> {
  const supabase = await createClient();
  const sabado = somarDias(domingo, 6);
  const [equipe, config, padroes, checkins, abertos] = await Promise.all([
    supabase.from("equipe").select("id, nome, usuario_id, ativo").order("nome"),
    supabase.from("funil_config").select("atendimento_inicio, atendimento_fim").maybeSingle(),
    supabase.from("escala_padrao").select("id, dia_semana, equipe_id, inicio, fim, tipo, desde, ate").lte("desde", sabado).or(`ate.is.null,ate.gte.${domingo}`),
    // entradas que tocam a semana (começaram antes do fim dela e não terminaram antes do começo)
    supabase
      .from("escala_checkins")
      .select("id, equipe_id, tipo, inicio, fim, encerrado_auto")
      .lt("inicio", instante(somarDias(sabado, 1), "00:00"))
      .or(`fim.is.null,fim.gte.${instante(domingo, "00:00")}`)
      .order("inicio"),
    supabase.from("escala_checkins").select("id, equipe_id, inicio").is("fim", null).order("inicio"),
  ]);
  for (const r of [equipe, padroes, checkins, abertos]) {
    if (r.error) throw new Error(`Erro ao carregar o check-in: ${r.error.message}`);
  }
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  const operacao = {
    inicio: String(config.data?.atendimento_inicio ?? "09:00").slice(0, 5),
    fim: String(config.data?.atendimento_fim ?? "22:00").slice(0, 5),
  };
  const dias = diasDaSemana(domingo).map((d) => montarDia(d, (padroes.data ?? []) as Padrao[], [], nomeDe, operacao));
  return {
    domingo,
    operacao,
    pessoas: (equipe.data ?? []).filter((p) => p.ativo).map((p) => ({ id: Number(p.id), nome: String(p.nome), temLogin: !!p.usuario_id })),
    dias,
    presencas: presencas(dias, (checkins.data ?? []) as Checkin[], nomeDe, new Date().toISOString()),
    agora: (abertos.data ?? []).map((c) => ({ checkinId: Number(c.id), equipeId: Number(c.equipe_id), nome: nomeDe.get(Number(c.equipe_id)) ?? "?", desde: String(c.inicio) })),
    eu: (equipe.data ?? []).find((p) => p.usuario_id === usuarioId)?.id ?? null,
  };
}

/** Só o necessário para o botão "Entrei na operação" e a lista de quem está online (Início). */
export async function operacaoAgora(usuarioId: string): Promise<{ eu: number | null; agora: Online[] }> {
  const supabase = await createClient();
  const [equipe, abertos] = await Promise.all([
    supabase.from("equipe").select("id, nome, usuario_id"),
    supabase.from("escala_checkins").select("id, equipe_id, inicio").is("fim", null).order("inicio"),
  ]);
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  return {
    eu: (equipe.data ?? []).find((p) => p.usuario_id === usuarioId)?.id ?? null,
    agora: (abertos.data ?? []).map((c) => ({ checkinId: Number(c.id), equipeId: Number(c.equipe_id), nome: nomeDe.get(Number(c.equipe_id)) ?? "?", desde: String(c.inicio) })),
  };
}

/** Escala padrão (horários fixos) em vigor de hoje em diante, para a configuração. */
export async function escalaPadraoVigente(hoje: string): Promise<(Padrao & { nome: string })[]> {
  const supabase = await createClient();
  const [padroes, equipe] = await Promise.all([
    supabase.from("escala_padrao").select("id, dia_semana, equipe_id, inicio, fim, tipo, desde, ate").or(`ate.is.null,ate.gte.${hoje}`).order("dia_semana").order("inicio"),
    supabase.from("equipe").select("id, nome"),
  ]);
  if (padroes.error) throw new Error(`Erro ao carregar os horários fixos: ${padroes.error.message}`);
  const nomeDe = new Map((equipe.data ?? []).map((p) => [Number(p.id), String(p.nome)]));
  return ((padroes.data ?? []) as Padrao[]).map((p) => ({ ...p, nome: nomeDe.get(p.equipe_id) ?? "?" }));
}
