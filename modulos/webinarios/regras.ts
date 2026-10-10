// Regras dos Webinários (v1): funil da sessão, custo de mensagens e comparação de variações A/B.
// Sem banco e sem tela. Contexto em docs/modulos/webinarios.md.

export type TipoWebinario = "downsell" | "ascensao";
export type StatusWebinario = "planejando" | "gravando" | "no_ar" | "pausado";

export const NOME_TIPO: Record<TipoWebinario, string> = { downsell: "Downsell (quem não comprou)", ascensao: "Ascensão (quem comprou)" };
export const NOME_STATUS: Record<StatusWebinario, string> = { planejando: "Planejando", gravando: "Gravando", no_ar: "No ar", pausado: "Pausado" };

/** Etapas do funil da sessão, na ordem. */
export const ETAPAS_SESSAO = [
  { campo: "convidados", nome: "Convidados" },
  { campo: "entraram_grupo", nome: "Entraram no grupo" },
  { campo: "entraram_live", nome: "Entraram na live" },
  { campo: "chegaram_pitch", nome: "Chegaram ao pitch" },
  { campo: "clicaram_oferta", nome: "Clicaram na oferta" },
  { campo: "compraram", nome: "Compraram" },
] as const;

export const CAMPOS_MENSAGEM = [
  { campo: "convite", nome: "Convite" },
  { campo: "ao_vivo", nome: "“Estou ao vivo”" },
  { campo: "recuperacao", nome: "Recuperação" },
] as const;

type CampoEtapa = (typeof ETAPAS_SESSAO)[number]["campo"];
type CampoMsg = `${(typeof CAMPOS_MENSAGEM)[number]["campo"]}_${"template" | "janela"}`;

export type Sessao = {
  id: number;
  webinario_id: number;
  dia: string;
  variacao: string | null;
  utm_content: string | null;
  recuperados_quente: number | null;
  recuperados_morno: number | null;
  observacoes: string | null;
} & Record<CampoEtapa, number | null> &
  Record<CampoMsg, number | null>;

export type LinhaFunilSessao = { nome: string; qtd: number | null; doAnterior: number | null; doTotal: number | null };

/** Funil de uma sessão (ou de várias somadas): % sobre a etapa de cima e sobre os convidados. */
export function funilDaSessao(s: Pick<Sessao, CampoEtapa>): LinhaFunilSessao[] {
  const total = s.convidados;
  return ETAPAS_SESSAO.map((e, i) => {
    const qtd = s[e.campo];
    const anterior = i === 0 ? null : s[ETAPAS_SESSAO[i - 1].campo];
    return {
      nome: e.nome,
      qtd,
      doAnterior: qtd != null && anterior ? qtd / anterior : null,
      doTotal: qtd != null && total ? qtd / total : null,
    };
  });
}

/** Soma várias sessões (campo vazio não soma; se todas estão vazias, fica vazio). */
export function somar(sessoes: Sessao[]): Pick<Sessao, CampoEtapa | CampoMsg | "recuperados_quente" | "recuperados_morno"> {
  const campos = [
    ...ETAPAS_SESSAO.map((e) => e.campo),
    ...CAMPOS_MENSAGEM.flatMap((m) => [`${m.campo}_template`, `${m.campo}_janela`] as CampoMsg[]),
    "recuperados_quente",
    "recuperados_morno",
  ] as const;
  const r = {} as Record<(typeof campos)[number], number | null>;
  for (const c of campos) {
    const vals = sessoes.map((s) => s[c]).filter((v): v is number => v != null);
    r[c] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  return r;
}

/** Custo estimado das mensagens: só as de template pagam (dentro da janela de 24h é grátis). */
export function custoMensagens(s: Pick<Sessao, CampoMsg>, custoPorMensagem: number) {
  const template = CAMPOS_MENSAGEM.reduce((t, m) => t + (s[`${m.campo}_template`] ?? 0), 0);
  const janela = CAMPOS_MENSAGEM.reduce((t, m) => t + (s[`${m.campo}_janela`] ?? 0), 0);
  return { template, janela, custoCentavos: Math.round(template * custoPorMensagem * 100) };
}

/** Comparação A/B: soma por variação e conversão convidados → compraram. */
export function porVariacao(sessoes: Sessao[]): { variacao: string; sessoes: number; convidados: number | null; compraram: number | null; conversao: number | null }[] {
  const grupos = new Map<string, Sessao[]>();
  for (const s of sessoes) {
    const k = s.variacao?.trim() || "sem variação";
    grupos.set(k, [...(grupos.get(k) ?? []), s]);
  }
  return [...grupos.entries()].map(([variacao, lista]) => {
    const t = somar(lista);
    return { variacao, sessoes: lista.length, convidados: t.convidados, compraram: t.compraram, conversao: t.convidados && t.compraram != null ? t.compraram / t.convidados : null };
  });
}
