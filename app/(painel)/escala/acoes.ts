"use server";

// Ações da Escala e check-in. Grava com o login de quem clicou: o RLS e as funções do banco
// conferem de novo (começar/encerrar turno usam a hora do servidor; só o admin decide plantão,
// corrige turno e mexe na escala padrão).

import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import { hojeSP } from "@/modulos/funil/calculo";
import { instante, somarDias } from "@/modulos/escala/regras";
import { refresh } from "next/cache";

const SO_ADMIN: EstadoForm = { erro: "Só o admin pode fazer isso." };
const horaOk = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const diaOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const tipoDe = (t: FormDataEntryValue | null) => (t === "raspagem" ? "raspagem" : "normal");

/** Mensagem do banco → texto para a pessoa (as funções do banco já mandam em português). */
function mensagem(e: { message: string; code?: string }): string {
  if (/turno aberto|não tem turno|não está ligado|não encontrado|exige motivo/i.test(e.message)) return e.message.replace(/^.*?: /, "");
  if (e.code === "42501" || /row-level security/i.test(e.message)) return "Você não tem permissão para isso.";
  return "Não deu para salvar.";
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export async function comecarTurno(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("escala_comecar_turno", { p_tipo: tipoDe(form.get("tipo")) });
  if (error) return { erro: mensagem(error) };
  refresh();
  return { ok: "Turno começado." };
}

// (anterior, form) é o formato do useActionState; aqui nenhum dos dois é usado
export async function encerrarTurno(): Promise<EstadoForm> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("escala_encerrar_turno");
  if (error) return { erro: mensagem(error) };
  refresh();
  return { ok: "Turno encerrado." };
}

/** Admin corrige o horário de um turno (exige motivo; fica registrado). */
export async function corrigirTurno(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const id = Number(form.get("id"));
  const dia = String(form.get("dia") ?? "");
  const inicio = String(form.get("inicio") ?? "");
  const fim = String(form.get("fim") ?? "");
  const motivo = String(form.get("motivo") ?? "").trim();
  if (!Number.isInteger(id) || id <= 0 || !diaOk(dia)) return { erro: "Turno inválido." };
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
  return { ok: "Turno corrigido (registrado com o motivo)." };
}

// ---------------------------------------------------------------------------
// Plantões
// ---------------------------------------------------------------------------

export async function pedirPlantao(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (!usuario) return { erro: "Entre de novo." };
  const dia = String(form.get("dia") ?? "");
  const inicio = String(form.get("inicio") ?? "");
  const fim = String(form.get("fim") ?? "");
  if (!diaOk(dia)) return { erro: "Escolha o dia." };
  if (!horaOk(inicio) || !horaOk(fim)) return { erro: "Horário no formato 09:00." };
  if (fim <= inicio) return { erro: "O fim tem que ser depois do início." };
  const supabase = await createClient();
  let equipeId: number | null = null;
  if (usuario.papel === "admin" && /^\d+$/.test(String(form.get("equipe_id") ?? ""))) {
    equipeId = Number(form.get("equipe_id"));
  } else {
    const { data } = await supabase.from("equipe").select("id").eq("usuario_id", usuario.id).maybeSingle();
    equipeId = data?.id ?? null;
  }
  if (!equipeId) return { erro: "Seu login não está ligado a ninguém da equipe. Fale com o admin." };
  if (usuario.papel !== "admin" && dia < hojeSP()) return { erro: "Só dá para marcar de hoje em diante." };
  const { data: novo, error } = await supabase.from("escala_plantoes").insert({ dia, equipe_id: equipeId, inicio, fim, tipo: tipoDe(form.get("tipo")) }).select("id").single();
  if (error) return { erro: mensagem(error) };
  // o admin marcando já decide: plantão confirmado na hora
  if (usuario.papel === "admin" && form.get("confirmar") === "sim") {
    await supabase.from("escala_plantoes").update({ situacao: "confirmado" }).eq("id", novo.id);
  }
  refresh();
  return { ok: usuario.papel === "admin" && form.get("confirmar") === "sim" ? "Plantão marcado e confirmado." : "Pedido enviado. Aparece na escala quando o admin confirmar." };
}

/** Admin confirma ou recusa (recusar pede motivo). */
export async function decidirPlantao(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const id = Number(form.get("id"));
  const situacao = form.get("situacao") === "recusado" ? "recusado" : form.get("situacao") === "confirmado" ? "confirmado" : null;
  const motivo = String(form.get("motivo") ?? "").trim();
  if (!Number.isInteger(id) || id <= 0 || !situacao) return { erro: "Pedido inválido." };
  if (situacao === "recusado" && motivo.length < 3) return { erro: "Escreva o motivo da recusa." };
  const supabase = await createClient();
  const { error } = await supabase.from("escala_plantoes").update({ situacao, motivo: situacao === "recusado" ? motivo.slice(0, 300) : null }).eq("id", id);
  if (error) return { erro: mensagem(error) };
  refresh();
  return { ok: situacao === "confirmado" ? "Confirmado." : "Recusado." };
}

/** A pessoa cancela o próprio plantão pendente. */
export async function cancelarPlantao(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  await supabase.rpc("escala_cancelar_plantao", { p_id: id });
  refresh();
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
  const desde = String(form.get("desde") ?? "") || hojeSP();
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
  return { ok: `${nome} entrou na equipe. Para fazer check-in, precisa de login (convite).` };
}
