"use server";

// Ações da aba Melhorias. Sugerir: qualquer logado (cai em "Ideia", em nome dele). O resto: só chefe
// e gerente. Tudo grava com o login de quem fez; o RLS e o gatilho conferem de novo.

import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import { ehPrioridade, ehStatus, lerCampos, type Status } from "@/modulos/melhorias/regras";
import { refresh } from "next/cache";

const SO_GESTOR: EstadoForm = { erro: "Só chefe e gerente podem alterar." };

async function gestor(): Promise<boolean> {
  const u = await usuarioLogado();
  return u?.vendas === "chefe" || u?.vendas === "gerente";
}

/** Botão "Sugerir melhoria" (Início): qualquer pessoa logada. */
export async function sugerirMelhoria(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (!usuario) return { erro: "Entre de novo para sugerir." };
  const campos = lerCampos(form);
  if ("erro" in campos) return campos;
  const supabase = await createClient();
  // sem .select(): quem não é gestor não lê o quadro (o RLS barraria a volta da linha)
  const { error } = await supabase.from("melhorias").insert({ ...campos, status: "ideia", sugerido_por: usuario.id });
  if (error) return { erro: "Não deu para enviar. Tente de novo." };
  return { ok: "Obrigado! A sugestão foi para a lista de ideias." };
}

export async function criarMelhoria(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (!(await gestor()) || !usuario) return SO_GESTOR;
  const campos = lerCampos(form);
  if ("erro" in campos) return campos;
  const status = form.get("status");
  const prioridade = form.get("prioridade");
  if (!ehStatus(status) || !ehPrioridade(prioridade)) return { erro: "Escolha status e prioridade." };
  const supabase = await createClient();
  const { error } = await supabase.from("melhorias").insert({ ...campos, status, prioridade, sugerido_por: usuario.id });
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return { ok: "Criada." };
}

export async function editarMelhoria(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await gestor())) return SO_GESTOR;
  const id = Number(form.get("id"));
  const campos = lerCampos(form);
  if ("erro" in campos) return campos;
  const prioridade = form.get("prioridade");
  if (!Number.isInteger(id) || id <= 0 || !ehPrioridade(prioridade)) return { erro: "Escolha a prioridade." };
  const novidade = String(form.get("novidade") ?? "").trim().slice(0, 300);
  const supabase = await createClient();
  const { error } = await supabase
    .from("melhorias")
    .update({ ...campos, prioridade, ...(form.has("novidade") ? { novidade: novidade || null } : {}) })
    .eq("id", id);
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return { ok: "Salvo." };
}

/** Arrastar para outra coluna (ou trocar no seletor). Indo para "Feito", `novidade` é a linha de Novidades. */
export async function moverMelhoria(id: number, status: Status, novidade?: string): Promise<EstadoForm> {
  if (!(await gestor())) return SO_GESTOR;
  if (!Number.isInteger(id) || id <= 0 || !ehStatus(status)) return { erro: "Movimento inválido." };
  const supabase = await createClient();
  const linha = status === "feito" ? { status, novidade: novidade?.trim().slice(0, 300) || null } : { status };
  const { error } = await supabase.from("melhorias").update(linha).eq("id", id);
  if (error) return { erro: "Não deu para mover." };
  refresh();
  return { ok: "Movida." };
}

export async function apagarMelhoria(form: FormData): Promise<void> {
  if (!(await gestor())) return;
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  await supabase.from("melhorias").delete().eq("id", id);
  refresh();
}
