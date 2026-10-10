"use server";

// Ações dos Webinários (v1). Só o admin do sistema; grava com o login dele (o RLS confere de novo).

import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import { CAMPOS_MENSAGEM, ETAPAS_SESSAO } from "@/modulos/webinarios/regras";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";

const SO_ADMIN: EstadoForm = { erro: "Só o admin pode alterar." };
const texto = (form: FormData, campo: string, max: number) => {
  const t = String(form.get(campo) ?? "").trim();
  return t ? t.slice(0, max) : null;
};
const idDe = (form: FormData, campo = "id") => {
  const n = Number(form.get(campo));
  return Number.isInteger(n) && n > 0 ? n : null;
};
/** inteiro ≥ 0 ou vazio; NaN se inválido */
const inteiro = (form: FormData, campo: string) => {
  const t = String(form.get(campo) ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, ""));
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

async function soAdmin() {
  const u = await usuarioLogado();
  return u?.papel === "admin" ? u : null;
}

export async function salvarWebinario(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await soAdmin())) return SO_ADMIN;
  const id = idDe(form);
  const nome = texto(form, "nome", 80);
  const tipo = String(form.get("tipo") ?? "");
  const status = String(form.get("status") ?? "planejando");
  const precoTxt = String(form.get("preco") ?? "").trim();
  const preco = precoTxt ? Number(precoTxt.replace(/\./g, "").replace(",", ".")) : null;
  if (!nome || nome.length < 2) return { erro: "Dê um nome ao webinário." };
  if (!["downsell", "ascensao"].includes(tipo)) return { erro: "Escolha o tipo." };
  if (!["planejando", "gravando", "no_ar", "pausado"].includes(status)) return { erro: "Status inválido." };
  if (preco !== null && !(Number.isFinite(preco) && preco > 0)) return { erro: "Preço inválido. Ex.: 297,00" };
  const campos = {
    nome,
    tipo,
    status,
    preco,
    oferta: texto(form, "oferta", 120),
    frequencia: texto(form, "frequencia", 80),
    horario: texto(form, "horario", 40),
    plataforma: texto(form, "plataforma", 60),
    hubla_oferta_id: texto(form, "hubla_oferta_id", 80),
    atualizado_em: new Date().toISOString(),
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("webinarios").update(campos).eq("id", id);
    if (error) return { erro: error.code === "23505" ? "Já existe um webinário com esse nome." : "Não deu para salvar." };
    refresh();
    return { ok: "Salvo." };
  }
  const { data, error } = await supabase.from("webinarios").insert(campos).select("id").single();
  if (error) return { erro: error.code === "23505" ? "Já existe um webinário com esse nome." : "Não deu para salvar." };
  redirect(`/webinarios/${data.id}`);
}

/** Cria as tarefas do checklist a partir do modelo (só os itens que ainda não existem). */
export async function criarChecklist(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await soAdmin())) return SO_ADMIN;
  const webinarioId = idDe(form, "webinario_id");
  const responsavel = idDe(form, "responsavel_id");
  const prazo = String(form.get("prazo") ?? "");
  if (!webinarioId) return { erro: "Webinário inválido." };
  if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return { erro: "Prazo inválido." };
  const supabase = await createClient();
  const [modelo, existentes] = await Promise.all([
    supabase.from("webinario_checklist_modelo").select("titulo").eq("ativo", true).order("ordem"),
    supabase.from("tarefas").select("titulo").eq("webinario_id", webinarioId),
  ]);
  const ja = new Set((existentes.data ?? []).map((t) => String(t.titulo)));
  const novas = (modelo.data ?? []).filter((m) => !ja.has(String(m.titulo)));
  if (!novas.length) return { ok: "O checklist já tem todos os itens do modelo." };
  const { error } = await supabase
    .from("tarefas")
    .insert(novas.map((m) => ({ titulo: String(m.titulo), webinario_id: webinarioId, responsavel_id: responsavel, prazo: prazo || null })));
  if (error) return { erro: "Não deu para criar o checklist." };
  refresh();
  return { ok: `${novas.length} item(ns) criados na aba Tarefas.` };
}

export async function salvarSessao(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await soAdmin())) return SO_ADMIN;
  const webinarioId = idDe(form, "webinario_id");
  const id = idDe(form);
  const dia = String(form.get("dia") ?? "");
  if (!webinarioId) return { erro: "Webinário inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { erro: "Escolha o dia da sessão." };
  const numeros: Record<string, number | null> = {};
  const campos = [
    ...ETAPAS_SESSAO.map((e) => e.campo),
    "recuperados_quente",
    "recuperados_morno",
    ...CAMPOS_MENSAGEM.flatMap((m) => [`${m.campo}_template`, `${m.campo}_janela`]),
  ];
  for (const c of campos) {
    const v = inteiro(form, c);
    if (Number.isNaN(v)) return { erro: "Use só números inteiros nas métricas." };
    numeros[c] = v;
  }
  const linha = { webinario_id: webinarioId, dia, variacao: texto(form, "variacao", 40), utm_content: texto(form, "utm_content", 80), observacoes: texto(form, "observacoes", 1000), ...numeros };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("webinario_sessoes").update(linha).eq("id", id) : await supabase.from("webinario_sessoes").insert(linha);
  if (error) return { erro: error.code === "23505" ? "Já existe uma sessão nesse dia com essa variação." : "Não deu para salvar a sessão." };
  refresh();
  return { ok: "Sessão salva." };
}

export async function apagarSessao(form: FormData): Promise<void> {
  if (!(await soAdmin())) return;
  const id = idDe(form);
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("webinario_sessoes").delete().eq("id", id);
  refresh();
}

export async function criarLink(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await soAdmin())) return SO_ADMIN;
  const webinarioId = idDe(form, "webinario_id");
  const tipo = String(form.get("tipo") ?? "");
  const titulo = texto(form, "titulo", 120);
  const url = texto(form, "url", 1000);
  if (!webinarioId) return { erro: "Webinário inválido." };
  if (!["roteiro", "copy", "script", "criativo", "playbook", "outro"].includes(tipo)) return { erro: "Escolha o tipo." };
  if (!titulo || titulo.length < 2) return { erro: "Dê um título ao link." };
  if (!url || !/^https?:\/\//.test(url)) return { erro: "O link tem que começar com http:// ou https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("webinario_links").insert({ webinario_id: webinarioId, tipo, titulo, url });
  if (error) return { erro: "Não deu para salvar o link." };
  refresh();
  return { ok: "Link salvo." };
}

export async function apagarLink(form: FormData): Promise<void> {
  if (!(await soAdmin())) return;
  const id = idDe(form);
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("webinario_links").delete().eq("id", id);
  refresh();
}

export async function salvarCustoMensagem(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (!(await soAdmin())) return SO_ADMIN;
  const v = Number(String(form.get("custo") ?? "").replace(",", "."));
  if (!Number.isFinite(v) || v < 0 || v > 10) return { erro: "Custo inválido. Ex.: 0,035" };
  const supabase = await createClient();
  const { error } = await supabase.from("webinarios_config").update({ custo_mensagem: v, atualizado_em: new Date().toISOString() }).eq("id", true);
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return { ok: "Salvo." };
}
