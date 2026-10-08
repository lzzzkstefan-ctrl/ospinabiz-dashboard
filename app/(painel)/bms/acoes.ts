"use server";

// Ações dos formulários da tela de BMs. Conferem se é admin antes de tudo
// (o RLS do banco confere de novo) e atualizam a tela depois de salvar.

import { ehAdmin } from "@/lib/auth/papeis";
import { atualizarBm, atualizarNumero, inserirBm, inserirNumero, nomesDasBms } from "@/modulos/bms/dados";
import { lerCamposNumero, limparTexto } from "@/modulos/bms/regras";
import { refresh } from "next/cache";

export type EstadoForm = { erro?: string; ok?: string };

const SO_ADMIN: EstadoForm = { erro: "Só admin pode alterar." };

function idDoForm(form: FormData): number | null {
  const id = Number(form.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function criarBm(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;

  const nome = limparTexto(form.get("nome"), 60);
  if (!nome) return { erro: "Digite o nome da BM." };

  const { erro } = await inserirBm({ nome, acesso_admin: form.get("acesso_admin") === "on" });
  if (erro) return { erro };

  refresh();
  return { ok: `BM "${nome}" cadastrada.` };
}

export async function editarBm(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;

  const id = idDoForm(form);
  const nome = limparTexto(form.get("nome"), 60);
  if (!id) return { erro: "BM não encontrada." };
  if (!nome) return { erro: "Digite o nome da BM." };

  const { erro } = await atualizarBm(id, { nome, acesso_admin: form.get("acesso_admin") === "on" });
  if (erro) return { erro };

  refresh();
  return { ok: "Salvo." };
}

export async function criarNumero(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;

  const nomes = await nomesDasBms();
  const lido = lerCamposNumero(form, (id) => nomes.get(id));
  if ("erro" in lido) return { erro: lido.erro };

  const { erro } = await inserirNumero(lido.campos);
  if (erro) return { erro };

  refresh();
  return { ok: `Número ${lido.campos.final} cadastrado.` };
}

export async function editarNumero(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;

  const id = idDoForm(form);
  if (!id) return { erro: "Número não encontrado." };

  const nomes = await nomesDasBms();
  const lido = lerCamposNumero(form, (bmId) => nomes.get(bmId));
  if ("erro" in lido) return { erro: lido.erro };

  const { erro } = await atualizarNumero(id, lido.campos);
  if (erro) return { erro };

  refresh();
  return { ok: "Salvo." };
}

/** Arquiva ou reativa uma BM ou um número. Arquivar tira dos testes sem apagar o histórico. */
export async function alternarAtivo(form: FormData): Promise<void> {
  if (!(await ehAdmin())) return;

  const id = idDoForm(form);
  if (!id) return;
  const ativo = form.get("ativo") === "true";

  if (form.get("tabela") === "bm") await atualizarBm(id, { ativo });
  else await atualizarNumero(id, { ativo });
  refresh();
}
