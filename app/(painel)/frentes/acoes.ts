"use server";

// Ações de Frentes (fase 3): dados da página, escada de ofertas e influencers.

import type { EstadoForm } from "@/components/formulario";
import { dbDaGestao, falhou, SO_GESTAO } from "@/lib/gestao-acao";
import { ehRemuneracao, ehStatusFrente, idDoForm, numeroDoForm, texto, urlOk } from "@/modulos/gestao/regras";
import { refresh } from "next/cache";

function pronto(e: EstadoForm | null, ok = "Salvo."): EstadoForm {
  if (e) return e;
  refresh();
  return { ok };
}

/** Objetivo, meta, público, canal, estratégia, status e notas. */
export async function salvarFrente(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idDoForm(form, "id");
  const status = form.get("status");
  if (!id) return { erro: "Frente não encontrada." };
  if (!ehStatusFrente(status)) return { erro: "Escolha o status." };
  const { error } = await g.db
    .from("frentes")
    .update({
      status,
      objetivo: texto(form, "objetivo", 500),
      meta_mensal: numeroDoForm(form, "meta_mensal"),
      publico: texto(form, "publico", 1000),
      canal: texto(form, "canal", 1000),
      estrategia: texto(form, "estrategia", 4000),
    })
    .eq("id", id);
  return pronto(falhou(error));
}

/** Notas livres (salvas à parte, para não precisar mexer no resto). */
export async function salvarNotasFrente(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idDoForm(form, "id");
  if (!id) return { erro: "Frente não encontrada." };
  const { error } = await g.db.from("frentes").update({ notas: texto(form, "notas", 20000) }).eq("id", id);
  return pronto(falhou(error), "Notas salvas.");
}

// ---------- escada de ofertas ----------
export async function salvarOferta(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idDoForm(form, "id");
  const frenteId = idDoForm(form, "frente_id");
  const nome = texto(form, "nome", 120);
  const tipo = String(form.get("tipo") ?? "");
  if (!nome) return { erro: "Dê um nome à oferta." };
  if (!["front", "downsell", "upsell", "order_bump"].includes(tipo)) return { erro: "Escolha o tipo." };
  const preco = numeroDoForm(form, "preco");
  const ate = numeroDoForm(form, "preco_ate");
  if (ate != null && (preco == null || ate < preco)) return { erro: "O \"até\" precisa ser maior que o preço." };
  const campos = { nome, tipo, preco, preco_ate: ate, condicao: texto(form, "condicao", 300) };
  if (id) {
    const { error } = await g.db.from("ofertas").update(campos).eq("id", id);
    return pronto(falhou(error));
  }
  if (!frenteId) return { erro: "Frente não encontrada." };
  const { data: ultima } = await g.db.from("ofertas").select("ordem").eq("frente_id", frenteId).order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { error } = await g.db.from("ofertas").insert({ ...campos, frente_id: frenteId, ordem: (ultima?.ordem ?? 0) + 1 });
  return pronto(falhou(error), "Oferta criada.");
}

export async function apagarOferta(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("ofertas").delete().eq("id", id);
  return pronto(falhou(error, "Não deu para apagar."), "Apagada.");
}

// ---------- influencers ----------
export async function salvarInfluencer(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const id = idDoForm(form, "id");
  const frenteId = idDoForm(form, "frente_id");
  const nome = texto(form, "nome", 120);
  if (!nome) return { erro: "Escreva o nome." };
  const link = texto(form, "link", 2000);
  if (link && !urlOk(link)) return { erro: "O link precisa começar com http:// ou https://." };
  const remuneracao = form.get("remuneracao");
  const inteiro = (c: string) => {
    const n = numeroDoForm(form, c);
    return n == null ? null : Math.round(n);
  };
  const arroba = texto(form, "arroba", 80);
  const campos = {
    nome,
    arroba: arroba ? `@${arroba.replace(/^@+/, "")}` : null,
    nicho: texto(form, "nicho", 120),
    seguidores: inteiro("seguidores"),
    contato: texto(form, "contato", 200),
    custo: numeroDoForm(form, "custo"),
    remuneracao: ehRemuneracao(remuneracao) ? remuneracao : null,
    link,
    cupom: texto(form, "cupom", 60),
    vendas: inteiro("vendas"),
    notas: texto(form, "notas", 2000),
  };
  if (id) {
    const { error } = await g.db.from("frente_influencers").update(campos).eq("id", id);
    return pronto(falhou(error));
  }
  if (!frenteId) return { erro: "Frente não encontrada." };
  const { error } = await g.db.from("frente_influencers").insert({ ...campos, frente_id: frenteId });
  return pronto(falhou(error), "Influencer adicionado.");
}

export async function apagarInfluencer(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const { error } = await g.db.from("frente_influencers").delete().eq("id", id);
  return pronto(falhou(error, "Não deu para apagar."), "Apagado.");
}
