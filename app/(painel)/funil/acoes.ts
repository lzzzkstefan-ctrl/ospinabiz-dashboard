"use server";

// Ações do Funil: configuração do atendimento (horas de espera e horário) e o histórico de
// mudanças no funil. Só o admin do sistema; grava com o login dele (o RLS confere de novo).

import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import { sincronizarFunil } from "@/modulos/funil/sincronizar";
import { refresh } from "next/cache";
import { after } from "next/server";

const SO_ADMIN: EstadoForm = { erro: "Só o admin pode alterar." };
const horaOk = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);

export async function salvarConfigFunil(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const horas = Number(String(form.get("horas_espera") ?? "").replace(",", "."));
  const inicio = String(form.get("inicio") ?? "");
  const fim = String(form.get("fim") ?? "");
  if (!Number.isFinite(horas) || horas <= 0 || horas > 72) return { erro: "Horas de espera: entre 0,5 e 72." };
  if (!horaOk(inicio) || !horaOk(fim)) return { erro: "Horário no formato 08:00." };
  if (fim <= inicio) return { erro: "O fim do atendimento tem que ser depois do início." };
  const minutosResposta = Number(String(form.get("minutos_resposta") ?? ""));
  if (!Number.isInteger(minutosResposta) || minutosResposta < 1 || minutosResposta > 600) return { erro: "Minutos para a 1ª resposta: inteiro entre 1 e 600." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("funil_config")
    .update({
      horas_espera: Math.round(horas * 10) / 10,
      atendimento_inicio: inicio,
      atendimento_fim: fim,
      minutos_primeira_resposta: minutosResposta,
      atualizado_por: usuario.id,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return { ok: "Salvo." };
}

/**
 * Etiqueta de chegada (CL): marca a chegada do lead, não é etapa. "desde" vem em horário de Brasília
 * (AAAA-MM-DDTHH:MM); só as colocações a partir daí contam. Depois de salvar, ressincroniza.
 */
export async function salvarEtiquetaChegada(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const etiqueta = String(form.get("etiqueta") ?? "").trim() || null;
  const desdeTexto = String(form.get("desde") ?? "").trim();
  let desde: string | null = null;
  if (desdeTexto) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(desdeTexto)) return { erro: "Data e hora inválidas." };
    desde = new Date(Date.parse(`${desdeTexto}:00-03:00`)).toISOString();
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("funil_config")
    .update({ etiqueta_chegada_dc_id: etiqueta, etiqueta_chegada_desde: etiqueta ? desde : null, atualizado_por: usuario.id, atualizado_em: new Date().toISOString() })
    .eq("id", true);
  if (error) return { erro: "Não deu para salvar." };
  sincronizarDepois();
  refresh();
  return { ok: "Salvo. As chegadas se acertam quando a sincronização terminar (alguns minutos)." };
}

export async function criarMudanca(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const dia = String(form.get("dia") ?? "");
  const etapa = String(form.get("etapa_id") ?? "");
  const descricao = String(form.get("descricao") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { erro: "Escolha o dia." };
  if (descricao.length < 3) return { erro: "Descreva o que mudou." };
  const supabase = await createClient();
  const { error } = await supabase.from("funil_mudancas").insert({ dia, etapa_id: /^\d+$/.test(etapa) ? Number(etapa) : null, descricao: descricao.slice(0, 300) });
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return { ok: "Mudança registrada." };
}

export async function apagarMudanca(form: FormData): Promise<void> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return;
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  await supabase.from("funil_mudancas").delete().eq("id", id);
  refresh();
}

/**
 * Números internos (teste): ficam fora de toda a dashboard do Funil. Depois de salvar, roda uma
 * sincronização em segundo plano, que marca (ou desmarca) os leads e conversas desse número.
 */
function sincronizarDepois() {
  after(async () => {
    const r = await sincronizarFunil();
    if (r.situacao === "falhou") console.error("funil: sincronização depois do número interno falhou:", r.erro);
  });
}

export async function criarNumeroInterno(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const nome = String(form.get("nome") ?? "").trim();
  const telefone = String(form.get("telefone") ?? "").replace(/\D/g, "");
  if (!nome) return { erro: "Dê um nome (ex.: Celular de teste do Davi)." };
  if (telefone.length < 8 || telefone.length > 15) return { erro: "Telefone com pelo menos 8 dígitos (pode ter +55, DDD, espaço ou traço)." };
  const supabase = await createClient();
  const { error } = await supabase.from("funil_numeros_internos").insert({ nome: nome.slice(0, 80), telefone });
  if (error) return { erro: error.code === "23505" ? "Esse número já está cadastrado (mesmos 8 últimos dígitos)." : "Não deu para salvar." };
  sincronizarDepois();
  refresh();
  return { ok: "Salvo. Sai da contagem quando a sincronização terminar (alguns minutos)." };
}

export async function apagarNumeroInterno(form: FormData): Promise<void> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return;
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("funil_numeros_internos").delete().eq("id", id);
  if (!error) sincronizarDepois();
  refresh();
}

/** Custo de mensagens: preço por mensagem cobrada, franquia mensal por número, moeda e janela grátis de anúncio. */
export async function salvarCustoMensagens(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  const preco = Number(String(form.get("preco") ?? "").replace(",", "."));
  const franquia = Number(String(form.get("franquia") ?? ""));
  const moeda = String(form.get("moeda") ?? "").trim().toUpperCase();
  const janela = Number(String(form.get("janela") ?? ""));
  if (!Number.isFinite(preco) || preco < 0 || preco >= 100) return { erro: "Preço por mensagem: número entre 0 e 100 (ex.: 0,035)." };
  if (!Number.isInteger(franquia) || franquia < 0 || franquia > 1_000_000) return { erro: "Franquia: número inteiro (ex.: 1000)." };
  if (!/^[A-Z]{3}$/.test(moeda)) return { erro: "Moeda: código de 3 letras (ex.: BRL)." };
  if (!Number.isInteger(janela) || janela < 0 || janela > 720) return { erro: "Janela grátis de anúncio: horas inteiras entre 0 e 720." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("funil_custo_config")
    .update({
      preco_mensagem: Math.round(preco * 10_000) / 10_000,
      franquia_mensal: franquia,
      moeda,
      janela_gratis_horas: janela,
      atualizado_por: usuario.id,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { erro: "Não deu para salvar." };
  // franquia e janela mudam a cobrança: recalcula na próxima sincronização, que roda agora
  after(async () => {
    await sincronizarFunil();
  });
  refresh();
  return { ok: "Salvo. O custo é recalculado na sincronização que começou agora." };
}

/**
 * Mapa do funil: recebe SÓ a estrutura já lida no navegador (modulos/funil/mapa-fluxo.ts) e guarda.
 * Mesmo nome substitui o anterior. Tudo é conferido de novo aqui (tipos, tamanhos, só as primeiras palavras).
 */
export async function salvarMapas(mapas: unknown): Promise<EstadoForm> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return SO_ADMIN;
  if (!Array.isArray(mapas) || !mapas.length || mapas.length > 50) return { erro: "Nenhum fluxo para salvar." };
  const TIPOS = new Set(["texto", "audio", "video", "imagem", "documento", "outro"]);
  const curto = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : null);
  const linhas = [];
  for (const m of mapas as Record<string, unknown>[]) {
    const nome = curto(m?.nome, 200)?.trim();
    if (!nome || !Array.isArray(m.blocos) || !Array.isArray(m.caminhos)) return { erro: "Arquivo em formato inesperado." };
    if (m.blocos.length > 3000 || m.caminhos.length > 60) return { erro: `O fluxo "${nome}" é grande demais.` };
    const blocos = (m.blocos as Record<string, unknown>[]).map((b) => ({
      id: curto(b?.id, 80) ?? "",
      tipo: TIPOS.has(String(b?.tipo)) ? String(b.tipo) : "outro",
      // só as primeiras palavras (no máximo 80 letras), nunca o texto inteiro
      inicio: curto(b?.inicio, 80),
    }));
    const ids = (x: unknown) => (Array.isArray(x) ? x.slice(0, 3000).map((i) => curto(i, 80) ?? "") : []);
    const caminhos = (m.caminhos as Record<string, unknown>[]).map((c) => ({
      nome: curto(c?.nome, 200) ?? "",
      blocos: ids(c?.blocos),
      juntaveis: Array.isArray(c?.juntaveis) ? (c.juntaveis as unknown[]).slice(0, 500).map(ids) : [],
    }));
    linhas.push({ nome, arquivo: curto(m.arquivo, 300), blocos, caminhos, enviado_por: usuario.id, enviado_em: new Date().toISOString() });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("funil_fluxos_mapa").upsert(linhas, { onConflict: "nome" });
  if (error) return { erro: "Não deu para salvar o mapa." };
  refresh();
  return { ok: linhas.length === 1 ? `Fluxo "${linhas[0].nome}" salvo.` : `${linhas.length} fluxos salvos.` };
}

export async function apagarMapa(form: FormData): Promise<void> {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") return;
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const supabase = await createClient();
  await supabase.from("funil_fluxos_mapa").delete().eq("id", id);
  refresh();
}
