"use server";

// Ações do Hoje (fase 2): prioridades da semana (até 3) e investimento/CPL da semana.

import type { EstadoForm } from "@/components/formulario";
import { dbDaGestao, falhou, SO_GESTAO } from "@/lib/gestao-acao";
import { diaDoForm, idDoForm, MAX_PRIORIDADES, numeroDoForm, texto } from "@/modulos/gestao/regras";
import { refresh } from "next/cache";

const segundaOk = (d: string | null): d is string => !!d && new Date(`${d}T12:00:00Z`).getUTCDay() === 1;

/** Cria (sem id) ou edita (com id) uma prioridade da semana. */
export async function salvarPrioridade(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idDoForm(form, "id");
  const semana = diaDoForm(form, "semana");
  const titulo = texto(form, "titulo", 160);
  if (!segundaOk(semana)) return { erro: "Semana inválida." };
  if (!titulo) return { erro: "Escreva a prioridade." };
  const campos = { titulo, descricao: texto(form, "descricao", 2000), dono_id: idDoForm(form, "dono_id"), prazo: diaDoForm(form, "prazo") };

  if (id) {
    const { error } = await g.db.from("prioridades").update(campos).eq("id", id);
    const e = falhou(error);
    if (e) return e;
  } else {
    const { count } = await g.db.from("prioridades").select("id", { count: "exact", head: true }).eq("semana", semana);
    if ((count ?? 0) >= MAX_PRIORIDADES) return { erro: `No máximo ${MAX_PRIORIDADES} prioridades por semana. Conclua ou apague uma antes.` };
    const { error } = await g.db.from("prioridades").insert({ ...campos, semana, ordem: count ?? 0 });
    const e = falhou(error);
    if (e) return e;
  }
  refresh();
  return { ok: "Salvo." };
}

export async function concluirPrioridade(id: number, feita: boolean): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("prioridades").update({ concluida_em: feita ? new Date().toISOString() : null }).eq("id", id);
  const e = falhou(error);
  if (e) return e;
  refresh();
  return { ok: feita ? "Concluída." : "Reaberta." };
}

export async function apagarPrioridade(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("prioridades").delete().eq("id", id);
  const e = falhou(error, "Não deu para apagar.");
  if (e) return e;
  refresh();
  return { ok: "Apagada." };
}

/** Investimento, CPL e (opcional) leads da semana. Digitado à mão: origem 'manual'. */
export async function salvarNumerosSemana(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const semana = diaDoForm(form, "semana");
  if (!segundaOk(semana)) return { erro: "Semana inválida." };
  const cpl = numeroDoForm(form, "cpl");
  if (cpl === 0) return { erro: "O CPL precisa ser maior que zero." };
  const leads = numeroDoForm(form, "leads");
  const { error } = await g.db.from("numeros_semana").upsert(
    {
      semana,
      investimento: numeroDoForm(form, "investimento"),
      cpl,
      leads: leads == null ? null : Math.round(leads),
      origem: "manual",
      atualizado_por: g.usuario.id,
    },
    { onConflict: "semana" },
  );
  const e = falhou(error);
  if (e) return e;
  refresh();
  return { ok: "Salvo." };
}
