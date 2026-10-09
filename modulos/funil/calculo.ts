// Cálculos da tela Funil e Leads. Sem banco e sem tela: recebe os dados prontos.
// Regras em docs/modulos/funil.md:
// - "chegou na etapa" = recebeu a etiqueta da etapa alguma vez. O funil é acumulado:
//   quem chegou na etapa 5 conta também nas etapas 1 a 4 (pode ter pulado uma etiqueta).
// - Comprou (venda na Hubla ou "pagou no Pix/CNPJ") conta como chegou na etapa de compra (Aluno).
// - Lead com etiqueta "fora do funil" (Menor de idade, Suporte, Lançamento) não entra no funil,
//   mas entra no "leads por dia".
// - Tempo entre etapas: só com datas reais do histórico (origem 'historico').

export type Etapa = {
  id: number;
  nome: string;
  tipo: "etapa" | "perda" | "objecao" | "downsell" | "fora";
  ordem: number | null;
  perda_na_etapa_id: number | null;
  comprou: boolean;
};
export type EtiquetaEtapa = { dc_id: string; etapa_id: number | null };
export type EventoLead = { etiqueta_dc_id: string | null; em: string; origem: "historico" | "sincronizacao" };
export type LeadFunil = {
  dc_id: string;
  dia: string;
  vendedor_id: number | null;
  numero_dc_id: string | null;
  compra: "hubla" | "fora_hubla" | "a_conferir" | null;
  eventos: EventoLead[];
};

export type LinhaFunil = { etapaId: number; nome: string; qtd: number; pctTotal: number; perdaAnterior: number | null };
export type Gap = { de: string; para: string; perda: number };
export type Resultado = {
  totalLeads: number;
  foraDoFunil: number;
  noFunil: number;
  porDia: { dia: string; qtd: number }[];
  funil: LinhaFunil[];
  maiorGap: Gap | null;
  perdas: { nome: string; onde: string | null; qtd: number; pct: number }[];
  compradores: { hubla: number; foraHubla: number; aConferir: number };
  tempos: { de: string; para: string; mediaMs: number | null; leads: number }[];
};

/** Base mínima na etapa de cima para contar como "maior gap": 3 leads ou 10% do funil. */
export function minimoParaGap(totalNoFunil: number): number {
  return Math.max(3, Math.ceil(totalNoFunil * 0.1));
}

/** Dias (AAAA-MM-DD) de `desde` a `ate`, inclusive. */
export function diasDoPeriodo(desde: string, ate: string): string[] {
  const dias: string[] = [];
  for (let t = Date.parse(`${desde}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86_400_000) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

export function calcularFunil(leads: LeadFunil[], etapas: Etapa[], etiquetas: EtiquetaEtapa[], desde: string, ate: string): Resultado {
  const etapaPorId = new Map(etapas.map((e) => [e.id, e]));
  const etapaDaEtiqueta = new Map(etiquetas.filter((t) => t.etapa_id !== null).map((t) => [t.dc_id, etapaPorId.get(t.etapa_id!)]));
  const passos = etapas.filter((e) => e.tipo === "etapa" && e.ordem !== null).sort((a, b) => a.ordem! - b.ordem!);
  const etapaDeCompra = passos.find((e) => e.comprou) ?? null;

  // por lead: primeira vez que chegou em cada etapa (qualquer tipo)
  const alcancadas = leads.map((l) => {
    const primeira = new Map<number, { em: string; historico: boolean }>();
    for (const ev of l.eventos) {
      const etapa = ev.etiqueta_dc_id ? etapaDaEtiqueta.get(ev.etiqueta_dc_id) : undefined;
      if (!etapa) continue;
      const atual = primeira.get(etapa.id);
      if (!atual || ev.em < atual.em) primeira.set(etapa.id, { em: ev.em, historico: ev.origem === "historico" });
    }
    return { lead: l, primeira };
  });

  const fora = new Set(etapas.filter((e) => e.tipo === "fora").map((e) => e.id));
  const doFunil = alcancadas.filter((a) => ![...a.primeira.keys()].some((id) => fora.has(id)));

  // etapa mais avançada de cada lead (compra conta como a etapa de compra)
  const ordemMaxima = (a: (typeof alcancadas)[number]) => {
    let max = 0;
    for (const id of a.primeira.keys()) {
      const e = etapaPorId.get(id);
      if (e?.tipo === "etapa" && e.ordem !== null) max = Math.max(max, e.ordem);
    }
    if (etapaDeCompra && (a.lead.compra === "hubla" || a.lead.compra === "fora_hubla")) max = Math.max(max, etapaDeCompra.ordem!);
    return max;
  };
  const maximos = doFunil.map(ordemMaxima);
  const total = doFunil.length;

  const funil: LinhaFunil[] = passos.map((p, i) => {
    const qtd = maximos.filter((m) => m >= p.ordem!).length;
    const anterior = i === 0 ? null : maximos.filter((m) => m >= passos[i - 1].ordem!).length;
    return {
      etapaId: p.id,
      nome: p.nome,
      qtd,
      pctTotal: total ? qtd / total : 0,
      perdaAnterior: anterior ? (anterior - qtd) / anterior : null,
    };
  });

  // maior gap: a maior perda entre duas etapas seguidas, só onde a etapa de cima tem base
  // mínima (senão 1 lead virando 0 vira "−100%" e engana)
  const baseMinima = minimoParaGap(total);
  let maiorGap: Gap | null = null;
  for (let i = 1; i < funil.length; i++) {
    const l = funil[i];
    if (l.perdaAnterior === null || l.perdaAnterior <= 0 || funil[i - 1].qtd < baseMinima) continue;
    if (!maiorGap || l.perdaAnterior > maiorGap.perda) maiorGap = { de: funil[i - 1].nome, para: l.nome, perda: l.perdaAnterior };
  }

  const perdas = etapas
    .filter((e) => e.tipo === "perda" || e.tipo === "objecao")
    .map((e) => {
      const qtd = doFunil.filter((a) => a.primeira.has(e.id)).length;
      return {
        nome: e.nome,
        onde: e.perda_na_etapa_id ? (etapaPorId.get(e.perda_na_etapa_id)?.nome ?? null) : null,
        qtd,
        pct: total ? qtd / total : 0,
      };
    });

  const tempos = passos.slice(1).map((p, i) => {
    const anterior = passos[i];
    const difs = doFunil.flatMap((a) => {
      const t0 = a.primeira.get(anterior.id);
      const t1 = a.primeira.get(p.id);
      if (!t0?.historico || !t1?.historico) return [];
      const d = Date.parse(t1.em) - Date.parse(t0.em);
      return d > 0 ? [d] : [];
    });
    return { de: anterior.nome, para: p.nome, mediaMs: difs.length ? difs.reduce((s, d) => s + d, 0) / difs.length : null, leads: difs.length };
  });

  const contagemDia = new Map<string, number>();
  for (const l of leads) contagemDia.set(l.dia, (contagemDia.get(l.dia) ?? 0) + 1);

  return {
    totalLeads: leads.length,
    foraDoFunil: leads.length - total,
    noFunil: total,
    porDia: diasDoPeriodo(desde, ate).map((dia) => ({ dia, qtd: contagemDia.get(dia) ?? 0 })),
    funil,
    maiorGap,
    perdas,
    compradores: {
      hubla: leads.filter((l) => l.compra === "hubla").length,
      foraHubla: leads.filter((l) => l.compra === "fora_hubla").length,
      aConferir: leads.filter((l) => l.compra === "a_conferir").length,
    },
    tempos,
  };
}

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------
export type Periodo = "hoje" | "7d" | "30d" | "mes" | "personalizado";

/** Dia de hoje (AAAA-MM-DD) em Brasília (UTC-3, sem horário de verão). */
export function hojeSP(agora = Date.now()): string {
  return new Date(agora - 3 * 3_600_000).toISOString().slice(0, 10);
}

const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaValido = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`));

/** Lê o período da URL. Personalizado: até 366 dias; datas trocadas são desinvertidas. */
export function lerPeriodo(p: string | undefined, de: string | undefined, ate: string | undefined, hoje: string): { periodo: Periodo; desde: string; ate: string } {
  if (p === "hoje") return { periodo: "hoje", desde: hoje, ate: hoje };
  if (p === "30d") return { periodo: "30d", desde: somarDias(hoje, -29), ate: hoje };
  if (p === "mes") return { periodo: "mes", desde: `${hoje.slice(0, 8)}01`, ate: hoje };
  if (p === "personalizado" && diaValido(de) && diaValido(ate)) {
    let [a, b] = de <= ate ? [de, ate] : [ate, de];
    if (b > hoje) b = hoje;
    if (somarDias(a, 365) < b) a = somarDias(b, -365);
    return { periodo: "personalizado", desde: a, ate: b };
  }
  return { periodo: "7d", desde: somarDias(hoje, -6), ate: hoje };
}

/** 3_720_000 → "1h 2min"; 90_000_000 → "1d 1h" */
export function duracao(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${min % 60 ? ` ${min % 60}min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? ` ${h % 24}h` : ""}`;
}
