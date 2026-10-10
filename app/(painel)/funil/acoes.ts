"use server";

// Ações do Funil: configuração do atendimento (horas de espera e horário) e o histórico de
// mudanças no funil. Só o admin do sistema; grava com o login dele (o RLS confere de novo).

import type { EstadoForm } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import { refresh } from "next/cache";

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
  const supabase = await createClient();
  const { error } = await supabase
    .from("funil_config")
    .update({ horas_espera: Math.round(horas * 10) / 10, atendimento_inicio: inicio, atendimento_fim: fim, atualizado_por: usuario.id, atualizado_em: new Date().toISOString() })
    .eq("id", true);
  if (error) return { erro: "Não deu para salvar." };
  refresh();
  return { ok: "Salvo." };
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
