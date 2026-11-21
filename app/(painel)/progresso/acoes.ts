"use server";

// Ações do Progresso: registrar o que foi feito (e o que isso gerou) e apagar um registro seu.
// O resto do XP vem sozinho das outras abas.

import type { EstadoForm } from "@/components/formulario";
import { dbDaGestao, falhou, SO_GESTAO } from "@/lib/gestao-acao";
import { ehTamanho, ehTipoRegistro, xpDoTamanho } from "@/modulos/gestao/progresso";
import { diaDoForm, hojeSP, somarDias, texto, urlOk } from "@/modulos/gestao/regras";
import { refresh } from "next/cache";

export async function registrar(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  const titulo = texto(form, "titulo", 160);
  const tipo = form.get("tipo");
  const tamanho = form.get("tamanho");
  if (!titulo) return { erro: "Escreva o que você fez." };
  if (!ehTipoRegistro(tipo)) return { erro: "Escolha o tipo." };
  if (!ehTamanho(tamanho)) return { erro: "Escolha o tamanho." };
  const hoje = hojeSP();
  const data = diaDoForm(form, "data") ?? hoje;
  if (data > hoje) return { erro: "Não dá para registrar um dia que ainda não chegou." };
  if (data < somarDias(hoje, -60)) return { erro: "Só dá para registrar até 60 dias para trás." };
  const link = texto(form, "link", 2000);
  if (link && !urlOk(link)) return { erro: "O link precisa começar com http:// ou https://." };

  const { error } = await g.db.from("registros").insert({
    data,
    titulo,
    resultado: texto(form, "resultado", 500),
    tipo,
    tamanho,
    link,
  });
  const e = falhou(error);
  if (e) return e;
  refresh();
  return { ok: `+${xpDoTamanho(tamanho)} XP` };
}

export async function apagarRegistro(id: number): Promise<EstadoForm> {
  const g = await dbDaGestao();
  if (!g) return SO_GESTAO;
  // o RLS só deixa apagar o que é seu
  const { error } = await g.db.from("registros").delete().eq("id", id);
  const e = falhou(error, "Não deu para apagar.");
  if (e) return e;
  refresh();
  return { ok: "Apagado." };
}
