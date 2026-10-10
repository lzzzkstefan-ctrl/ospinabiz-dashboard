"use server";

// Ações do Check-in (aba /escala). Grava com o login de quem clicou: o RLS e as funções do banco
// conferem de novo ("Entrei na operação" / "Sair da operação" usam a hora do servidor; só o admin
// corrige um registro e mexe nos horários fixos). Plantões extras saíram em 10/10/2026.

import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import { hojeSP } from "@/modulos/funil/calculo";
import { inicioDaSemana, instante, somarDias } from "@/modulos/escala/regras";
import { avisarEntradaSaida, avisarPausa, avisoDeTeste, verificarAlertas } from "@/modulos/escala/alertas";
import { refresh } from "next/cache";
import { after } from "next/server";

const SO_ADMIN: EstadoForm = { erro: "Só o admin pode fazer isso." };
const horaOk = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const diaOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const tipoDe = (t: FormDataEntryValue | null) => (t === "raspagem" ? "raspagem" : "normal");

/** Mensagem do banco → texto para a pessoa. */
function mensagem(e: { message: string; code?: string }): string {
  if (/já tem um turno aberto/i.test(e.message)) return "Você já está na operação.";
  if (/não tem turno aberto/i.test(e.message)) return "Você não está na operação.";
  if (/não está ligado/i.test(e.message)) return "Seu login não está ligado a ninguém da equipe. Fale com o admin.";
  if (/exige motivo/i.test(e.message)) return "Corrigir exige motivo.";
  if (/já está em pausa/i.test(e.message)) return "Você já está em pausa.";
  if (/não está em pausa/i.test(e.message)) return "Você não está em pausa.";
  if (/não está na operação/i.test(e.message)) return "Entre na operação antes de pausar.";
  if (/Motivo de pausa inválido/i.test(e.message)) return "Escolha o motivo da pausa.";
  if (e.code === "42501" || /row-level security/i.test(e.message)) return "Você não tem permissão para isso.";
  return "Não deu para salvar.";
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

/** Depois de entrar/sair/pausar: confere na hora se a operação ficou descoberta (ou coberta de novo). */
function conferirAlertasDepois() {
  after(async () => {
    try {
      await verificarAlertas();
    } catch (e) {
      console.error("escala: alertas depois da ação falharam:", e);
    }
  });
}

/** "Entrei na operação" (hora do servidor). */
export async function entrarNaOperacao(): Promise<EstadoForm> {
  const supabase = await createClient();
  const { data: checkinId, error } = await supabase.rpc("escala_comecar_turno", { p_tipo: "normal" });
  if (error) return { erro: mensagem(error) };
  const usuario = await usuarioLogado();
  after(async () => {
    try {
      await avisarEntradaSaida(Number(checkinId), "entrada", usuario?.id ?? "");
    } catch (e) {
      console.error("escala: aviso de entrada falhou:", e);
    }
  });
  conferirAlertasDepois();
  refresh();
  return { ok: "Você está online." };
}

/** "Sair da operação" (hora do servidor). */
export async function sairDaOperacao(): Promise<EstadoForm> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("escala_encerrar_turno");
  if (error) return { erro: mensagem(error) };
  const usuario = await usuarioLogado();
  // a entrada que acabou de fechar (a mais recente da pessoa)
  const { data: eu } = await supabase.from("equipe").select("id").eq("usuario_id", usuario?.id ?? "").maybeSingle();
  const { data: ultima } = eu
    ? await supabase.from("escala_checkins").select("id").eq("equipe_id", eu.id).not("fim", "is", null).order("fim", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  after(async () => {
    try {
      if (ultima) await avisarEntradaSaida(Number(ultima.id), "saida", usuario?.id ?? "");
    } catch (e) {
      console.error("escala: aviso de saída falhou:", e);
    }
  });
  conferirAlertasDepois();
  refresh();
  return { ok: "Você saiu da operação." };
}

const MOTIVOS = ["almoco", "banho", "imprevisto", "outro"] as const;

/** "Pausa": escolhe o motivo (e um texto opcional). Só quem está online; hora do servidor. */
export async function pausar(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const motivo = String(form.get("motivo") ?? "");
  if (!(MOTIVOS as readonly string[]).includes(motivo)) return { erro: "Escolha o motivo da pausa." };
  const detalhe = String(form.get("detalhe") ?? "").trim().slice(0, 120) || null;
  const supabase = await createClient();
  const { data: pausaId, error } = await supabase.rpc("escala_pausar", { p_motivo: motivo, p_detalhe: detalhe });
  if (error) return { erro: mensagem(error) };
  const usuario = await usuarioLogado();
  after(async () => {
    try {
      await avisarPausa(Number(pausaId), "inicio", usuario?.id ?? "");
      await verificarAlertas();
    } catch (e) {
      console.error("escala: aviso de pausa falhou:", e);
    }
  });
  refresh();
  return { ok: "Pausa começada." };
}

/** "Voltar da pausa" (hora do servidor). */
export async function voltarDaPausa(): Promise<EstadoForm> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("escala_voltar_da_pausa");
  if (error) return { erro: mensagem(error) };
  const usuario = await usuarioLogado();
  // a pausa que acabou de fechar (a mais recente da pessoa)
  const { data: eu } = await supabase.from("equipe").select("id").eq("usuario_id", usuario?.id ?? "").maybeSingle();
  const { data: ultima } = eu
    ? await supabase.from("escala_pausas").select("id").eq("equipe_id", eu.id).not("fim", "is", null).order("fim", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  after(async () => {
    try {
      if (ultima) await avisarPausa(Number(ultima.id), "fim", usuario?.id ?? "");
      await verificarAlertas();
    } catch (e) {
      console.error("escala: aviso de volta da pausa falhou:", e);
    }
  });
  refresh();
  return { ok: "Você voltou da pausa." };
}

/** Admin: a partir de quantos minutos a pausa é longa (destaque em vermelho). */
export async function salvarPausaLonga(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const min = Number(form.get("minutos"));
  if (!Number.isInteger(min) || min < 1 || min > 600) return { erro: "Minutos: inteiro entre 1 e 600." };
  const supabase = await createClient();
  const { error } = await supabase.from("escala_config").update({ pausa_longa_min: min, atualizado_por: usuario.id, atualizado_em: new Date().toISOString() }).eq("id", true);
  if (error) return { erro: mensagem(error) };
  refresh();
  return { ok: "Salvo." };
}

/** Admin corrige o horário de entrada/saída (exige motivo; fica registrado). */
export async function corrigirTurno(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const id = Number(form.get("id"));
  const dia = String(form.get("dia") ?? "");
  const inicio = String(form.get("inicio") ?? "");
  const fim = String(form.get("fim") ?? "");
  const motivo = String(form.get("motivo") ?? "").trim();
  if (!Number.isInteger(id) || id <= 0 || !diaOk(dia)) return { erro: "Registro inválido." };
  if (!horaOk(inicio) || (fim && !horaOk(fim))) return { erro: "Horário no formato 09:00." };
  if (fim && fim < inicio) return { erro: "O fim tem que ser depois do início." };
  if (motivo.length < 3) return { erro: "Escreva o motivo da correção." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("escala_checkins")
    .update({ inicio: instante(dia, inicio), fim: fim ? instante(dia, fim) : null, motivo_correcao: motivo.slice(0, 300) })
    .eq("id", id);
  if (error) return { erro: mensagem(error) };
  refresh();
  return { ok: "Corrigido (registrado com o motivo)." };
}

// ---------------------------------------------------------------------------
// Escala padrão e pessoas (só admin)
// ---------------------------------------------------------------------------

export async function criarPadrao(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const dias = form.getAll("dia_semana").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const equipeId = Number(form.get("equipe_id"));
  const inicio = String(form.get("inicio") ?? "");
  const fim = String(form.get("fim") ?? "");
  // sem data: domingo da semana atual (a semana toda passa a valer)
  const desde = String(form.get("desde") ?? "") || inicioDaSemana(hojeSP());
  if (!dias.length) return { erro: "Marque pelo menos um dia da semana." };
  if (!Number.isInteger(equipeId) || equipeId <= 0) return { erro: "Escolha a pessoa." };
  if (!horaOk(inicio) || !horaOk(fim)) return { erro: "Horário no formato 09:00." };
  if (fim <= inicio) return { erro: "O fim tem que ser depois do início." };
  if (!diaOk(desde)) return { erro: "Data de início inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("escala_padrao")
    .insert(dias.map((d) => ({ dia_semana: d, equipe_id: equipeId, inicio, fim, tipo: tipoDe(form.get("tipo")), desde })));
  if (error) return { erro: mensagem(error) };
  refresh();
  return { ok: `Escala salva (${dias.length} dia${dias.length > 1 ? "s" : ""}).` };
}

/**
 * Tira alguém da escala padrão. O que já valeu fica no histórico (termina ontem); o que ainda nem
 * começou é apagado.
 */
export async function encerrarPadrao(form: FormData): Promise<void> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return;
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  const hoje = hojeSP();
  const { data } = await supabase.from("escala_padrao").select("desde").eq("id", id).maybeSingle();
  if (!data) return;
  if (String(data.desde) >= hoje) await supabase.from("escala_padrao").delete().eq("id", id);
  else await supabase.from("escala_padrao").update({ ate: somarDias(hoje, -1) }).eq("id", id);
  refresh();
}

export async function criarPessoa(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const nome = String(form.get("nome") ?? "").trim();
  if (nome.length < 2) return { erro: "Escreva o nome." };
  const supabase = await createClient();
  const { error } = await supabase.from("equipe").insert({ nome: nome.slice(0, 60) });
  if (error) return { erro: error.code === "23505" ? "Já tem alguém com esse nome na equipe." : "Não deu para salvar." };
  refresh();
  return { ok: `${nome} entrou na equipe. Para entrar na operação (check-in), precisa de login (convite).` };
}

// ---------------------------------------------------------------------------
// Notificações (cada um mexe só nas próprias; o RLS confere)
// ---------------------------------------------------------------------------

export type InscricaoNavegador = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Aparelho ativou as notificações: guarda a inscrição (troca se já existia). */
export async function salvarInscricao(sub: InscricaoNavegador, aparelho: string): Promise<EstadoForm> {
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) return { erro: "Inscrição inválida." };
  const supabase = await createClient();
  await supabase.from("push_inscricoes").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_inscricoes").insert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, aparelho: aparelho.slice(0, 200) });
  if (error) return { erro: "Não deu para ativar." };
  refresh();
  return { ok: "Notificações ativadas neste aparelho." };
}

export async function apagarInscricao(endpoint: string): Promise<EstadoForm> {
  const supabase = await createClient();
  await supabase.from("push_inscricoes").delete().eq("endpoint", endpoint);
  refresh();
  return { ok: "Notificações desligadas neste aparelho." };
}

/** Manda um aviso de teste só para os aparelhos de quem clicou. */
export async function testarNotificacao(): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (!usuario) return { erro: "Entre de novo." };
  const n = await avisoDeTeste(usuario.id);
  return n ? { ok: `Teste enviado (${n} aparelho${n > 1 ? "s" : ""}).` } : { erro: "Nenhum aparelho seu ativado (ou as chaves de notificação faltam no servidor)." };
}

/** Quais avisos a pessoa quer receber. */
export async function salvarPreferencias(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (!usuario) return { erro: "Entre de novo." };
  const marcado = (k: string) => form.get(k) === "on";
  const escolhas = {
    pausa_inicio: marcado("pausa_inicio"),
    pausa_fim: marcado("pausa_fim"),
    pausa_longa: marcado("pausa_longa"),
    operacao_descoberta: marcado("operacao_descoberta"),
    sem_checkin: marcado("sem_checkin"),
    entrada: marcado("entrada"),
    saida: marcado("saida"),
  };
  const supabase = await createClient();
  // já tem escolhas salvas: atualiza (com a data); primeira vez: cria (a data o banco põe sozinho;
  // a regra do banco não deixa mandar atualizado_em ao criar)
  const { data: mudou, error: e1 } = await supabase
    .from("notificacoes_preferencias")
    .update({ ...escolhas, atualizado_em: new Date().toISOString() })
    .eq("usuario_id", usuario.id)
    .select("usuario_id");
  if (e1) return { erro: "Não deu para salvar." };
  if (!mudou?.length) {
    const { error: e2 } = await supabase.from("notificacoes_preferencias").insert(escolhas);
    if (e2) return { erro: "Não deu para salvar." };
  }
  refresh();
  return { ok: "Salvo." };
}
