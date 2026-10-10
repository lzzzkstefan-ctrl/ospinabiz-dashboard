"use server";

// Ações da aba Usuários. Antes de tudo: quem clicou é chefe ou gerente em Vendas? (o resto das
// regras — só o chefe mexe em chefe, ninguém se desativa, sempre um chefe ativo — é conferido em
// modulos/usuarios/gestao.ts com o estado atual do banco).

import { usuarioLogado } from "@/lib/auth/papeis";
import { convidar, desativar, mudarLigacoes, mudarPapel, mudarTesteVisivel, novoLink, reativar, type Resultado } from "@/modulos/usuarios/gestao";
import type { PapelUsuario } from "@/modulos/usuarios/regras";
import { refresh } from "next/cache";
import { headers } from "next/headers";

const PAPEIS: PapelUsuario[] = ["chefe", "gerente", "vendedor", "plantonista"];

async function gestor(): Promise<string | null> {
  const u = await usuarioLogado();
  return u && (u.vendas === "chefe" || u.vendas === "gerente") ? u.id : null;
}

/** Endereço do site para o link do convite (produção: o domínio da Vercel). */
async function site(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "ospinabiz-dashboard.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const NEGADO: Resultado = { erro: "Só o chefe e o gerente gerenciam usuários." };

export async function acaoConvidar(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const eu = await gestor();
  if (!eu) return NEGADO;
  const papel = String(form.get("papel") ?? "") as PapelUsuario;
  if (!PAPEIS.includes(papel)) return { erro: "Escolha o papel." };
  const r = await convidar(eu, { email: String(form.get("email") ?? ""), nome: String(form.get("nome") ?? ""), papel }, await site());
  refresh();
  return r;
}

export async function acaoNovoLink(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const eu = await gestor();
  if (!eu) return NEGADO;
  const r = await novoLink(eu, String(form.get("id") ?? ""), await site());
  refresh();
  return r;
}

export async function acaoEditar(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const eu = await gestor();
  if (!eu) return NEGADO;
  const id = String(form.get("id") ?? "");
  const papel = String(form.get("papel") ?? "") as PapelUsuario;
  if (!PAPEIS.includes(papel)) return { erro: "Escolha o papel." };
  const r1 = await mudarPapel(eu, id, papel);
  if (r1.erro) return r1;
  const r2 = await mudarLigacoes(eu, id, { atendente: String(form.get("atendente") ?? "") || null, utm: String(form.get("utm") ?? "") || null });
  if (r2.erro) {
    refresh();
    return r2;
  }
  // só aparece no formulário de conta de teste
  if (form.has("teste_visivel_campo")) {
    const r3 = await mudarTesteVisivel(eu, id, form.get("teste_visivel") === "on");
    refresh();
    if (r3.erro) return r3;
    if (r3.ok && r3.ok !== "Sem mudança.") return r3;
  }
  refresh();
  return { ok: r1.ok && r1.ok !== "Sem mudança." ? r1.ok : "Salvo." };
}

export async function acaoDesativar(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const eu = await gestor();
  if (!eu) return NEGADO;
  const r = await desativar(eu, String(form.get("id") ?? ""));
  refresh();
  return r;
}

export async function acaoReativar(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const eu = await gestor();
  if (!eu) return NEGADO;
  const r = await reativar(eu, String(form.get("id") ?? ""));
  refresh();
  return r;
}
