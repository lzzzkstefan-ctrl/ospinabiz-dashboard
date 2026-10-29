"use server";

// Ações dos formulários da tela de BMs. Conferem se é admin antes de tudo
// (o RLS do banco confere de novo) e atualizam a tela depois de salvar.

import { ehAdmin } from "@/lib/auth/papeis";
import { atualizarBm, atualizarNumero, banirBm, desfazerBanBm, inserirBm, inserirNumero, nomesDasBms, type CamposSaude } from "@/modulos/bms/dados";
import { hojeBrasilia, lerCamposNumero, lerSituacao, limparTexto, LIMITES, normalizarTelefone, type Qualidade } from "@/modulos/bms/regras";
import { problemaNaObservacao } from "@/modulos/bms/saude";
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

  const ddd = limparTexto(form.get("ddd"), 2);
  if (ddd && !/^[1-9][0-9]$/.test(ddd)) return { erro: "DDD inválido (2 dígitos)." };

  const { erro } = await inserirNumero({ ...lido.campos, ddd: ddd || null });
  if (erro) return { erro };

  refresh();
  return { ok: `Número ${lido.campos.final} cadastrado.` };
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

/** Marca a BM como banida (data padrão: hoje) e todos os números dela como banidos, com a mesma data. */
export async function banir(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;

  const id = idDoForm(form);
  if (!id) return { erro: "BM não encontrada." };
  const data = String(form.get("data") ?? "") || hojeBrasilia();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Data do ban inválida." };
  if (data > hojeBrasilia()) return { erro: "A data do ban não pode ser no futuro." };

  const { erro } = await banirBm(id, data, limparTexto(form.get("motivo"), 300));
  if (erro) return { erro };

  refresh();
  return { ok: "BM marcada como banida." };
}

/** Desfaz o ban: a BM e os números voltam para a situação de antes. */
export async function desfazerBan(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;

  const id = idDoForm(form);
  if (!id) return { erro: "BM não encontrada." };

  const { erro } = await desfazerBanBm(id);
  if (erro) return { erro };

  refresh();
  return { ok: "Ban desfeito." };
}

/** Data yyyy-mm-dd do formulário: vazia = null; inválida ou no futuro = erro. */
function lerData(valor: FormDataEntryValue | null, nome: string): { data: string | null } | { erro: string } {
  const data = String(valor ?? "");
  if (!data) return { data: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: `${nome} inválida.` };
  if (data > hojeBrasilia()) return { erro: `${nome} não pode ser no futuro.` };
  return { data };
}

/**
 * Card do número principal: telefone completo, limite e qualidade (manuais, enquanto a Meta não
 * informa), observação e "em operação desde". A observação nunca guarda usuário, senha ou IP.
 */
export async function salvarSaude(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;

  const id = idDoForm(form);
  if (!id) return { erro: "Número não encontrado." };

  const textoTelefone = limparTexto(form.get("telefone"), 30);
  const telefone = textoTelefone ? normalizarTelefone(textoTelefone) : null;
  if (textoTelefone && !telefone) return { erro: "Telefone inválido. Use DDD + número, ex.: (21) 99999-1072." };

  const limiteTexto = String(form.get("limite") ?? "");
  const limite = limiteTexto ? Number(limiteTexto) : null;
  if (limite !== null && !(LIMITES as readonly number[]).includes(limite)) return { erro: "Limite inválido." };

  const q = form.get("qualidade");
  const qualidade: Qualidade | null = q === "verde" || q === "amarela" || q === "vermelha" ? q : null;

  const observacao = limparTexto(form.get("observacao"), 300);
  const problema = observacao ? problemaNaObservacao(observacao) : null;
  if (problema) return { erro: problema };

  const desde = lerData(form.get("em_operacao_desde"), "A data de início");
  if ("erro" in desde) return desde;

  const { erro } = await atualizarNumero(id, { telefone, limite, qualidade, observacao: observacao || null, em_operacao_desde: desde.data });
  if (erro) return { erro };

  refresh();
  return { ok: "Salvo." };
}

/**
 * "Gerenciar números": muda a situação de um número (em operação, reserva, desconectado, banido) e
 * se ele é principal. Banido usa a data como data do ban; principal em operação sem início usa a
 * data como começo do contador "dias sem ban".
 */
export async function mudarSituacao(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await ehAdmin())) return SO_ADMIN;

  const id = idDoForm(form);
  if (!id) return { erro: "Escolha o número." };
  const situacao = lerSituacao(form.get("situacao"));
  const principal = form.get("principal") === "on";
  const lida = lerData(form.get("data"), "A data");
  if ("erro" in lida) return lida;
  const data = lida.data ?? hojeBrasilia();

  const campos: CamposSaude = { situacao, principal };
  if (situacao === "banido") campos.banido_em = data;
  if (principal && situacao === "operacao" && form.get("tem_inicio") !== "true") campos.em_operacao_desde = data;

  const { erro } = await atualizarNumero(id, campos);
  if (erro) return { erro };

  refresh();
  return { ok: "Situação salva." };
}
