"use server";

// Ações da tela de Tarefas. Qualquer usuário logado cria, edita, move e troca o responsável
// (o RLS do banco confere de novo). Ninguém apaga.

import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { atualizarTarefa, inserirTarefa, ordemNoTopo } from "@/modulos/tarefas/dados";
import { ehStatus, lerCamposTarefa, lerResponsavel } from "@/modulos/tarefas/regras";
import { refresh } from "next/cache";

const SEM_LOGIN: EstadoForm = { erro: "Entre de novo para salvar." };

function idValido(valor: unknown): number | null {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** "+ Nova tarefa": título e responsável; entra no topo de "A fazer". */
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

  const id = idValido(form.get("id"));
  if (!id) return { erro: "Tarefa não encontrada." };

  const lido = lerCamposTarefa(form);
  if ("erro" in lido) return { erro: lido.erro };
  const status = form.get("status");

  const { erro } = await atualizarTarefa(id, { ...lido.campos, ...(ehStatus(status) ? { status } : {}) });
  if (erro) return { erro };

  refresh();
  return { ok: "Salvo." };
}

/** Arrastar e soltar: coluna e posição numa única atualização. Com erro, a tela recarrega do banco. */
export async function moverTarefa(id: number, status: string, ordem: number): Promise<EstadoForm> {
  if (!(await usuarioLogado())) return SEM_LOGIN;
  if (!idValido(id) || !ehStatus(status) || !Number.isFinite(ordem)) return { erro: "Movimento inválido." };

  const r = await atualizarTarefa(id, { status, ordem });
  refresh();
  return r;
}

/** Mini menu da bolinha: troca só o responsável. */
export async function trocarResponsavel(id: number, responsavelId: number | null): Promise<EstadoForm> {
  if (!(await usuarioLogado())) return SEM_LOGIN;
  const responsavel_id = lerResponsavel(responsavelId ?? "");
  if (!idValido(id) || responsavel_id === undefined) return { erro: "Responsável inválido." };

  const r = await atualizarTarefa(id, { responsavel_id });
  refresh();
  return r;
}

/** Bolinha de concluir: manda para o topo de "Feito" ou volta para o topo de "A fazer". */
export async function alternarConclusao(form: FormData): Promise<void> {
  if (!(await usuarioLogado())) return;

  const id = idValido(form.get("id"));
  if (!id) return;
  const status = form.get("status") === "feito" ? "feito" : "a_fazer";

  await atualizarTarefa(id, { status, ordem: await ordemNoTopo(status) });
  refresh();
}
