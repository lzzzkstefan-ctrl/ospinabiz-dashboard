// Botões de IA da aba Criativos (Gerar variações, Versão orgânica, Roteiro, Ideias, Analisar referência,
// Separar campeão). Rota fina: confere que quem chamou é da gestão e chama modulos/criativos/gerar.
// /api passa pelo proxy sem login, por isso a checagem é aqui.
//
// maxDuration 300 s: o máximo do plano Hobby da Vercel com Fluid compute (o mesmo que o Funil já usa). Uma
// geração costuma levar de 20 s a 2 min; se a primeira resposta vier quebrada, a segunda tentativa cabe.

import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import { analisarReferencia, gerarIdeias, gerarOrganico, gerarRoteiro, gerarVariacoes, separarCampeao } from "@/modulos/criativos/gerar";
import { ehModo, linkOk } from "@/modulos/criativos/regras";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type Corpo = { modo?: unknown; criativo_id?: unknown; texto?: unknown; link?: unknown };

export async function POST(req: Request) {
  const u = await usuarioLogado();
  if (!u?.gestao) return NextResponse.json({ ok: false, erro: "Só a gestão usa a IA de criativos." }, { status: 403 });

  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }
  const modo = corpo.modo;
  if (!ehModo(modo)) return NextResponse.json({ ok: false, erro: "Modo inválido." }, { status: 400 });
  const id = typeof corpo.criativo_id === "number" && Number.isInteger(corpo.criativo_id) ? corpo.criativo_id : null;
  const texto = typeof corpo.texto === "string" ? corpo.texto : "";
  const link = typeof corpo.link === "string" && corpo.link.trim() ? corpo.link.trim() : null;
  if (!linkOk(link)) return NextResponse.json({ ok: false, erro: "O link precisa começar com http:// ou https://." }, { status: 400 });

  const db = await createClient();
  const precisaId = modo === "variacoes" || modo === "roteiro" || modo === "organico";
  if (precisaId && id === null) return NextResponse.json({ ok: false, erro: "Criativo não informado." }, { status: 400 });

  const r =
    modo === "variacoes"
      ? await gerarVariacoes(db, id!)
      : modo === "roteiro"
        ? await gerarRoteiro(db, id!)
        : modo === "organico"
          ? await gerarOrganico(db, id!)
          : modo === "ideias"
            ? await gerarIdeias(db, texto)
            : modo === "analise_referencia"
              ? await analisarReferencia(db, link, texto)
              : await separarCampeao(db, texto);

  return NextResponse.json(r, { status: r.ok ? 200 : r.limite ? 429 : 422 });
}
