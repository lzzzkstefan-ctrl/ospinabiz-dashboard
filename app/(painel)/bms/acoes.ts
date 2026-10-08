"use server";

// Ações dos formulários da tela de BMs. Conferem se é admin antes de tudo
// (o RLS do banco confere de novo) e atualizam a tela depois de salvar.

import { ehAdmin } from "@/lib/auth/papeis";
import { inserirBm, inserirNumero, mudarAtivo } from "@/modulos/bms/dados";
import { limparTexto, normalizarTelefone } from "@/modulos/bms/regras";
import { refresh } from "next/cache";

export type EstadoForm = { erro?: string; ok?: string };

export async function criarBm(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return { erro: "Só admin pode cadastrar." };

  const nome = limparTexto(form.get("nome"), 60);
  if (!nome) return { erro: "Digite o nome da BM." };

  const { erro } = await inserirBm(nome);
  if (erro) return { erro };

  refresh();
  return { ok: `BM "${nome}" cadastrada.` };
}

export async function criarNumero(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return { erro: "Só admin pode cadastrar." };

  const bmId = Number(form.get("bm_id"));
  const telefone = normalizarTelefone(String(form.get("telefone") ?? ""));
  const apelido = limparTexto(form.get("apelido"), 60);

  if (!Number.isInteger(bmId) || bmId <= 0) return { erro: "Escolha a BM." };
  if (!telefone) return { erro: "Telefone inválido. Use DDD + número, ex.: (11) 99999-0348." };
  if (!apelido) return { erro: "Digite o apelido usado na Data Crazy." };

  const { erro } = await inserirNumero({ bmId, telefone, apelido });
  if (erro) return { erro };

  refresh();
  return { ok: `Número "${apelido}" cadastrado.` };
}

export async function alternarAtivo(form: FormData): Promise<void> {
  if (!(await ehAdmin())) return;

  const tabela = form.get("tabela") === "bm" ? "monitor_bms" : "monitor_numeros";
  const id = Number(form.get("id"));
  const ativo = form.get("ativo") === "true";
  if (!Number.isInteger(id) || id <= 0) return;

  await mudarAtivo(tabela, id, ativo);
  refresh();
}
