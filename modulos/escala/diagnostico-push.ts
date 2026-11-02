// Diagnóstico das notificações (só admin; o RLS confere): por aparelho, quantos avisos foram enviados, aceitos
// por Apple/Google e confirmados pelo aparelho, e em que dia parou. Tela em /admin/notificacoes.

import { createClient } from "@/lib/supabase/server";
import { emBrasilia } from "./regras";

/** Aviso mais novo que isso ainda pode chegar: não conta como não confirmado. */
const ESPERA_MS = 60 * 60_000;
const DIAS = 14;

export type Entrega = {
  id: string;
  usuario_id: string | null;
  inscricao_id: number | null;
  aparelho: string | null;
  situacao: string;
  enviado_em: string;
  recebido_em: string | null;
  sw_versao: number | null;
  notificacoes_enviadas: { titulo: string; tipo: string } | null;
};

export type LinhaAparelho = {
  chave: string;
  pessoa: string;
  aparelho: string;
  /** a inscrição ainda existe (aparelho ativo) */
  inscrito: boolean;
  appVistoEm: string | null;
  enviados: number;
  aceitos: number;
  recebidos: number;
  /** aceitos que não confirmaram depois do primeiro recibo do aparelho (antes dele, pode ser só o service worker antigo) */
  perdidos: number;
  /** o aparelho nunca confirmou nada: service worker antigo (falta abrir o app) ou não está recebendo */
  nuncaConfirmou: boolean;
  ultimoRecebido: string | null;
  atrasoMedianoMs: number | null;
  swVersao: number | null;
  /** por dia (Brasília): aceitos e recebidos */
  porDia: Map<string, { aceitos: number; recebidos: number }>;
};

export type Diagnostico = { dias: string[]; aparelhos: LinhaAparelho[]; naoConfirmados: { id: string; quando: string; pessoa: string; aparelho: string; aviso: string }[]; desde: string | null };

/** Pura: monta as linhas a partir das entregas e das inscrições atuais. */
export function montarDiagnostico(
  entregas: Entrega[],
  inscricoes: { id: number; usuario_id: string; aparelho: string | null; visto_em: string | null }[],
  nomes: Map<string, string>,
  agora: number,
): Diagnostico {
  const linhas = new Map<string, LinhaAparelho & { atrasos: number[]; primeiroRecibo: number | null }>();
  const nova = (chave: string, usuario: string | null, aparelho: string | null, inscrito: boolean, vistoEm: string | null) => ({
    chave,
    pessoa: (usuario && nomes.get(usuario)) || "sem pessoa",
    aparelho: aparelho ?? "aparelho sem nome",
    inscrito,
    appVistoEm: vistoEm,
    enviados: 0,
    aceitos: 0,
    recebidos: 0,
    perdidos: 0,
    nuncaConfirmou: false,
    ultimoRecebido: null,
    atrasoMedianoMs: null,
    swVersao: null,
    porDia: new Map(),
    atrasos: [],
    primeiroRecibo: null,
  });
  for (const i of inscricoes) linhas.set(String(i.id), nova(String(i.id), i.usuario_id, i.aparelho, true, i.visto_em));

  const ordem = [...entregas].sort((a, b) => a.enviado_em.localeCompare(b.enviado_em));
  for (const e of ordem) {
    const chave = String(e.inscricao_id);
    if (!linhas.has(chave)) linhas.set(chave, nova(chave, e.usuario_id, e.aparelho, false, null));
    const l = linhas.get(chave)!;
    l.enviados++;
    if (e.situacao === "ok") l.aceitos++;
    if (e.recebido_em) {
      l.recebidos++;
      l.primeiroRecibo ??= Date.parse(e.enviado_em);
      if (!l.ultimoRecebido || e.recebido_em > l.ultimoRecebido) l.ultimoRecebido = e.recebido_em;
      l.atrasos.push(Math.max(0, Date.parse(e.recebido_em) - Date.parse(e.enviado_em)));
      l.swVersao = e.sw_versao ?? l.swVersao;
    }
    if (e.situacao === "ok" || e.recebido_em) {
      const dia = emBrasilia(e.enviado_em).dia;
      const d = l.porDia.get(dia) ?? { aceitos: 0, recebidos: 0 };
      if (e.situacao === "ok") d.aceitos++;
      if (e.recebido_em) d.recebidos++;
      l.porDia.set(dia, d);
    }
  }

  const naoConfirmados: Diagnostico["naoConfirmados"] = [];
  for (const e of ordem) {
    const l = linhas.get(String(e.inscricao_id))!;
    const esperando = agora - Date.parse(e.enviado_em) < ESPERA_MS;
    if (e.situacao !== "ok" || e.recebido_em || esperando) continue;
    if (l.primeiroRecibo === null || Date.parse(e.enviado_em) > l.primeiroRecibo) {
      if (l.primeiroRecibo !== null) l.perdidos++;
      naoConfirmados.push({ id: e.id, quando: e.enviado_em, pessoa: l.pessoa, aparelho: l.aparelho, aviso: e.notificacoes_enviadas?.titulo ?? "aviso" });
    }
  }

  const aparelhos = [...linhas.values()].map(({ atrasos, primeiroRecibo, ...l }) => {
    const o = [...atrasos].sort((a, b) => a - b);
    return { ...l, nuncaConfirmou: primeiroRecibo === null, atrasoMedianoMs: o.length ? o[Math.floor(o.length / 2)] : null };
  });
  aparelhos.sort((a, b) => a.pessoa.localeCompare(b.pessoa) || Number(b.inscrito) - Number(a.inscrito) || a.aparelho.localeCompare(b.aparelho));

  const dias = [...new Set(entregas.map((e) => emBrasilia(e.enviado_em).dia))].sort();
  return { dias, aparelhos, naoConfirmados: naoConfirmados.reverse().slice(0, 50), desde: ordem[0]?.enviado_em ?? null };
}

export async function carregarDiagnostico(): Promise<Diagnostico> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  const [entregas, inscricoes, equipe] = await Promise.all([
    supabase
      .from("push_entregas")
      .select("id, usuario_id, inscricao_id, aparelho, situacao, enviado_em, recebido_em, sw_versao, notificacoes_enviadas(titulo, tipo)")
      .gte("enviado_em", desde)
      .order("enviado_em", { ascending: false })
      .limit(5000),
    supabase.from("push_inscricoes").select("id, usuario_id, aparelho, visto_em"),
    supabase.from("equipe").select("nome, usuario_id"),
  ]);
  if (entregas.error) throw new Error(`Erro ao carregar as entregas: ${entregas.error.message}`);
  if (inscricoes.error) throw new Error(`Erro ao carregar os aparelhos: ${inscricoes.error.message}`);
  const nomes = new Map((equipe.data ?? []).filter((p) => p.usuario_id).map((p) => [String(p.usuario_id), String(p.nome)]));
  return montarDiagnostico(entregas.data as unknown as Entrega[], inscricoes.data ?? [], nomes, Date.now());
}
