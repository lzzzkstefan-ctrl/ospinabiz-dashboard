// Avisos dos compromissos previstos (18/10/2026). Roda no servidor com a chave secreta.
// - avisarCompromisso: logo depois de cadastrar, editar ou cancelar (pela própria ação), para a equipe
//   toda menos quem fez: "📅 Vyenna · Qua 21/10 · fora das 14h às 16h · consulta";
// - lembreteDaVespera: às 20h (pg_cron dos alertas, a cada 2 min), os compromissos de amanhã, se houver.
// Quem recebe: preferência "compromisso" (sem escolha, todos). Canal: push. O WhatsApp de avisos
// (template da Meta) ainda não está configurado; quando estiver, entra aqui como nos feriados.
// Contexto em docs/modulos/escala.md ("Compromissos previstos").

import { createAdminClient } from "@/lib/supabase/admin";
import { avisar } from "./alertas";
import { COLUNAS_COMPROMISSO, diaCurto, emBrasilia, linhaDoCompromisso, somarDias, textoLongoCompromisso, type Compromisso } from "./regras";

/** Hora do lembrete da véspera (minutos do dia, Brasília) e até quando ele ainda sai. */
export const LEMBRETE_VESPERA_MIN = 20 * 60;
const LEMBRETE_ATE_MIN = 20 * 60 + 30;

export type AcaoCompromisso = "novo" | "editado" | "cancelado";

const normalizar = (c: Compromisso): Compromisso => ({ ...c, pessoa: Number(c.pessoa), inicio: c.inicio?.slice(0, 5) ?? null, fim: c.fim?.slice(0, 5) ?? null });

/** Título e corpo do aviso de um compromisso. */
export function textoDoAviso(c: Compromisso, nome: string, acao: AcaoCompromisso, quemFez: string | null) {
  const linha = linhaDoCompromisso(c, nome);
  const por = quemFez && quemFez !== nome ? ` por ${quemFez}` : "";
  if (acao === "cancelado") return { titulo: `❌ Cancelado · ${linha.replace("📅 ", "")}`, corpo: `Compromisso previsto cancelado${por}.` };
  return { titulo: linha, corpo: acao === "novo" ? `Compromisso previsto cadastrado${por}.` : `Compromisso previsto alterado${por}.` };
}

/** Chamado depois da ação (em segundo plano). Pessoa de teste não avisa ninguém. */
export async function avisarCompromisso(id: number, acao: AcaoCompromisso, quemFez: string): Promise<number> {
  const db = createAdminClient();
  const { data } = await db.from("compromissos").select(COLUNAS_COMPROMISSO).eq("id", id).maybeSingle<Compromisso>();
  if (!data) return 0;
  const c = normalizar(data);
  const { data: equipe } = await db.from("equipe").select("id, nome, usuario_id, teste");
  const pessoa = (equipe ?? []).find((p) => Number(p.id) === c.pessoa);
  if (pessoa?.teste) return 0;
  const autor = (equipe ?? []).find((p) => p.usuario_id === quemFez)?.nome ?? null;
  // cada mudança é um acontecimento novo (editar duas vezes avisa duas vezes)
  return avisar(db, "compromisso", `${acao}:${c.id}:${Date.now()}`, { ...textoDoAviso(c, String(pessoa?.nome ?? "Alguém"), acao, autor), url: "/escala#compromissos" }, { exceto: quemFez });
}

/** Texto do lembrete: "Vyenna fora das 14h às 16h (consulta) · Davi chega às 11h (atraso na entrada)". */
export function textoDaVespera(lista: Compromisso[], nomeDe: Map<number, string>): string {
  return lista.map((c) => `${nomeDe.get(c.pessoa) ?? "Alguém"} ${textoLongoCompromisso(c)}${c.motivo ? ` (${c.motivo})` : ""}`).join(" · ");
}

/** 20h: os compromissos de amanhã (uma vez por dia; nada se não houver). */
export async function lembreteDaVespera(agoraIso = new Date().toISOString()): Promise<number> {
  const agora = emBrasilia(agoraIso);
  if (agora.minuto < LEMBRETE_VESPERA_MIN || agora.minuto >= LEMBRETE_ATE_MIN) return 0;
  const db = createAdminClient();
  const amanha = somarDias(agora.dia, 1);
  const [{ data }, { data: equipe }] = await Promise.all([
    db.from("compromissos").select(COLUNAS_COMPROMISSO).eq("data", amanha).eq("cancelado", false).order("inicio", { nullsFirst: true }).returns<Compromisso[]>(),
    db.from("equipe").select("id, nome, teste"),
  ]);
  const testes = new Set((equipe ?? []).filter((p) => p.teste).map((p) => Number(p.id)));
  const lista = (data ?? []).map(normalizar).filter((c) => !testes.has(c.pessoa));
  if (!lista.length) return 0;
  const nomeDe = new Map((equipe ?? []).map((p) => [Number(p.id), String(p.nome)]));
  return avisar(db, "compromisso", `vespera:${amanha}`, {
    titulo: `📅 Amanhã (${diaCurto(amanha)}): ${lista.length} compromisso${lista.length > 1 ? "s" : ""} previsto${lista.length > 1 ? "s" : ""}`,
    corpo: textoDaVespera(lista, nomeDe),
    url: "/escala#compromissos",
  });
}
