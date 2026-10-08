"use server";

// Ações da tela de Tarefas. Qualquer usuário logado cria, edita, conclui e reabre
// (o RLS do banco confere de novo). Ninguém apaga.

import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { atualizarTarefa, inserirTarefa } from "@/modulos/tarefas/dados";
import { lerCamposTarefa } from "@/modulos/tarefas/regras";
import { refresh } from "next/cache";

const SEM_LOGIN: EstadoForm = { erro: "Entre de novo para salvar." };

function idDoForm(form: FormData): number | null {
  const id = Number(form.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function criarTarefa(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await usuarioLogado())) return SEM_LOGIN;

  const lido = lerCamposTarefa(form);
  if ("erro" in lido) return { erro: lido.erro };

  const { erro } = await inserirTarefa(lido.campos);
  if (erro) return { erro };

  refresh();
  return { ok: "Tarefa criada." };
}

export async function editarTarefa(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await usuarioLogado())) return SEM_LOGIN;

  const id = idDoForm(form);
  if (!id) return { erro: "Tarefa não encontrada." };

  const lido = lerCamposTarefa(form);
  if ("erro" in lido) return { erro: lido.erro };

  const { erro } = await atualizarTarefa(id, lido.campos);
  if (erro) return { erro };

  refresh();
  return { ok: "Salvo." };
}

/** Conclui uma tarefa pendente ou reabre uma concluída. */
export async function alternarConclusao(form: FormData): Promise<void> {
  if (!(await usuarioLogado())) return;

  const id = idDoForm(form);
  if (!id) return;
  const status = form.get("status") === "concluida" ? "concluida" : "pendente";

  await atualizarTarefa(id, { status });
  refresh();
}
