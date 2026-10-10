// Regras da Escala e check-in (sem tela, sem banco). Contexto em docs/modulos/escala.md.
// Datas "AAAA-MM-DD" e horários "HH:MM" no fuso de Brasília (UTC-3, sem horário de verão).
// Dias da semana: 0 = domingo ... 6 = sábado.

export type Tipo = "normal" | "raspagem";
export type SituacaoPlantao = "pendente" | "confirmado" | "recusado" | "cancelado";

export type Padrao = { id: number; dia_semana: number; equipe_id: number; inicio: string; fim: string; tipo: Tipo; desde: string; ate: string | null };
export type Plantao = { id: number; dia: string; equipe_id: number; inicio: string; fim: string; tipo: Tipo; situacao: SituacaoPlantao; motivo: string | null };
export type Checkin = { id: number; equipe_id: number; tipo: Tipo; inicio: string; fim: string | null; encerrado_auto: boolean };

export type Entrada = {
  origem: "padrao" | "plantao";
  id: number;
  equipeId: number;
  nome: string;
  inicio: string;
  fim: string;
  tipo: Tipo;
};

export type Faixa = { inicio: string; fim: string };

export type DiaEscala = {
  dia: string;
  diaSemana: number;
  /** escala padrão + plantões confirmados */
  entradas: Entrada[];
  /** plantões pedidos que o admin ainda não confirmou (aparecem apagados) */
  pendentes: Entrada[];
  /** horário da operação sem ninguém (nem normal nem raspagem) */
  descoberto: Faixa[];
  /** coberto = turno normal no horário todo; parcial = tem alguém, mas sobra buraco ou só raspagem;
   * descoberto = ninguém */
  situacao: "coberto" | "parcial" | "descoberto";
  temRaspagem: boolean;
};

export const NOME_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const NOME_DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const FUSO_MS = 3 * 3_600_000;

export const minutos = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
};
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** "09:00" → "9h"; "14:30" → "14h30" */
export const horaCurta = (h: string) => {
  const [hh, mm] = h.slice(0, 5).split(":");
  return `${Number(hh)}h${mm === "00" ? "" : mm}`;
};

/** Dia da semana de uma data (0 = domingo). */
export function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

export function somarDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Domingo da semana do dia. */
export function inicioDaSemana(dia: string): string {
  return somarDias(dia, -diaDaSemana(dia));
}

export function diasDaSemana(domingo: string): string[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(domingo, i));
}

/** Data e minuto do dia (Brasília) de um instante. */
export function emBrasilia(iso: string): { dia: string; minuto: number } {
  const d = new Date(Date.parse(iso) - FUSO_MS);
  return { dia: d.toISOString().slice(0, 10), minuto: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** Instante (ISO) de um dia + horário de Brasília. */
export function instante(dia: string, hora: string): string {
  return new Date(Date.parse(`${dia}T${hora.slice(0, 5)}:00Z`) + FUSO_MS).toISOString();
}

export const padraoVale = (p: Padrao, dia: string) => p.dia_semana === diaDaSemana(dia) && p.desde <= dia && (!p.ate || p.ate >= dia);

/** Junta faixas que se encostam ou se sobrepõem (em minutos). */
function unir(faixas: [number, number][]): [number, number][] {
  const ord = [...faixas].sort((a, b) => a[0] - b[0]);
  const r: [number, number][] = [];
  for (const [a, b] of ord) {
    const ult = r[r.length - 1];
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b);
    else r.push([a, b]);
  }
  return r;
}

/** Partes de [ini, fim] que nenhuma faixa cobre. */
function buracos(ini: number, fim: number, cobertas: [number, number][]): [number, number][] {
  const r: [number, number][] = [];
  let t = ini;
  for (const [a, b] of unir(cobertas)) {
    if (b <= t) continue;
    if (a >= fim) break;
    if (a > t) r.push([t, Math.min(a, fim)]);
    t = Math.max(t, b);
    if (t >= fim) break;
  }
  if (t < fim) r.push([t, fim]);
  return r;
}

/** Um dia da escala: padrão que vale no dia + plantões confirmados; pendentes à parte. */
export function montarDia(
  dia: string,
  padroes: Padrao[],
  plantoes: Plantao[],
  nomeDe: Map<number, string>,
  operacao: { inicio: string; fim: string },
): DiaEscala {
  const nome = (id: number) => nomeDe.get(id) ?? "?";
  const entradas: Entrada[] = [
    ...padroes.filter((p) => padraoVale(p, dia)).map((p) => ({ origem: "padrao" as const, id: p.id, equipeId: p.equipe_id, nome: nome(p.equipe_id), inicio: p.inicio.slice(0, 5), fim: p.fim.slice(0, 5), tipo: p.tipo })),
    ...plantoes
      .filter((p) => p.dia === dia && p.situacao === "confirmado")
      .map((p) => ({ origem: "plantao" as const, id: p.id, equipeId: p.equipe_id, nome: nome(p.equipe_id), inicio: p.inicio.slice(0, 5), fim: p.fim.slice(0, 5), tipo: p.tipo })),
  ].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.nome.localeCompare(b.nome));
  const pendentes: Entrada[] = plantoes
    .filter((p) => p.dia === dia && p.situacao === "pendente")
    .map((p) => ({ origem: "plantao" as const, id: p.id, equipeId: p.equipe_id, nome: nome(p.equipe_id), inicio: p.inicio.slice(0, 5), fim: p.fim.slice(0, 5), tipo: p.tipo }));

  const ini = minutos(operacao.inicio);
  const fim = minutos(operacao.fim);
  const faixa = (e: Entrada): [number, number] => [minutos(e.inicio), minutos(e.fim)];
  const descoberto = buracos(ini, fim, entradas.map(faixa)).map(([a, b]) => ({ inicio: hhmm(a), fim: hhmm(b) }));
  const semNormal = buracos(ini, fim, entradas.filter((e) => e.tipo === "normal").map(faixa));
  const situacao = !entradas.length ? "descoberto" : semNormal.length ? "parcial" : "coberto";
  return { dia, diaSemana: diaDaSemana(dia), entradas, pendentes, descoberto, situacao, temRaspagem: entradas.some((e) => e.tipo === "raspagem") };
}

// ---------------------------------------------------------------------------
// Presença: escalado x realizado, por pessoa e por dia
// ---------------------------------------------------------------------------

/** Tolerância de atraso na entrada (minutos). */
export const TOLERANCIA_ATRASO_MIN = 10;

export type MotivoPausa = "almoco" | "banho" | "imprevisto" | "outro";
export const NOME_MOTIVO: Record<MotivoPausa, string> = { almoco: "Almoço", banho: "Banho", imprevisto: "Imprevisto", outro: "Outro" };
export type Pausa = { id: number; checkin_id: number; equipe_id: number; motivo: MotivoPausa; detalhe: string | null; inicio: string; fim: string | null; encerrada_com_saida: boolean };

/** Pausa já cortada no dia, com a duração (minutos reais; a aberta conta até agora). */
export type PausaDoDia = Faixa & { id: number; motivo: MotivoPausa; detalhe: string | null; aberta: boolean; comSaida: boolean; minutos: number };

export type Presenca = {
  dia: string;
  equipeId: number;
  nome: string;
  escalado: Faixa[];
  /** entradas (check-ins) do dia, já cortadas no dia, cada uma com as pausas dela */
  feito: (Faixa & { checkinId: number; aberto: boolean; auto: boolean; tipo: Tipo; pausas: PausaDoDia[] })[];
  minutosEscalados: number;
  /** tempo online = entradas menos as pausas */
  minutosFeitos: number;
  minutosPausa: number;
  /** minutos entre o início escalado e o primeiro check-in (só quando positivo) */
  atrasoMin: number | null;
  /** "antes" = dia anterior ao primeiro check-in registrado (o check-in ainda não existia): mostra "—" */
  situacao: "ok" | "atrasou" | "faltou" | "extra" | "em_andamento" | "a_fazer" | "antes";
};

/** Corta [inicio, fim] (fim vazio = agora) no dia `dia` de Brasília: minutos do dia, ou null se não toca. */
function cortarNoDia(inicioIso: string, fimIso: string | null, dia: string, agora: { dia: string; minuto: number }): [number, number] | null {
  const a = emBrasilia(inicioIso);
  const b = fimIso ? emBrasilia(fimIso) : agora;
  if (a.dia > dia || b.dia < dia) return null;
  return [a.dia < dia ? 0 : a.minuto, b.dia > dia ? 24 * 60 : b.minuto];
}

/**
 * Para cada dia da lista e cada pessoa com escala OU check-in no dia. `agoraIso` decide o que já
 * passou: falta só conta depois que o horário escalado começou. `primeiroDia` = dia do primeiro
 * check-in registrado: antes dele o check-in não existia, então não há "não entrou".
 */
export function presencas(
  dias: DiaEscala[],
  checkins: Checkin[],
  pausas: Pausa[],
  nomeDe: Map<number, string>,
  agoraIso: string,
  primeiroDia: string | null,
): Presenca[] {
  const agora = emBrasilia(agoraIso);
  const r: Presenca[] = [];
  for (const d of dias) {
    // entradas do dia (Brasília), cortadas no dia, com as pausas de cada uma
    const doDia = new Map<number, Presenca["feito"]>();
    for (const c of checkins) {
      const faixa = cortarNoDia(c.inicio, c.fim, d.dia, agora);
      if (!faixa) continue;
      const suas: PausaDoDia[] = pausas
        .filter((p) => p.checkin_id === c.id)
        .flatMap((p) => {
          const f = cortarNoDia(p.inicio, p.fim, d.dia, agora);
          return f ? [{ id: p.id, motivo: p.motivo, detalhe: p.detalhe, aberta: !p.fim, comSaida: p.encerrada_com_saida, inicio: hhmm(f[0]), fim: hhmm(Math.min(f[1], 24 * 60 - 1)), minutos: Math.max(0, f[1] - f[0]) }] : [];
        })
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
      const lista = doDia.get(c.equipe_id) ?? [];
      lista.push({ checkinId: c.id, inicio: hhmm(faixa[0]), fim: hhmm(Math.min(faixa[1], 24 * 60 - 1)), aberto: !c.fim, auto: c.encerrado_auto, tipo: c.tipo, pausas: suas });
      doDia.set(c.equipe_id, lista);
    }
    const pessoas = new Set<number>([...d.entradas.map((e) => e.equipeId), ...doDia.keys()]);
    for (const id of pessoas) {
      const escaladoFaixas = unir(d.entradas.filter((e) => e.equipeId === id).map((e) => [minutos(e.inicio), minutos(e.fim)] as [number, number]));
      const feito = (doDia.get(id) ?? []).sort((a, b) => a.inicio.localeCompare(b.inicio));
      const minutosEscalados = escaladoFaixas.reduce((s, [a, b]) => s + (b - a), 0);
      const minutosPausa = feito.reduce((s, f) => s + f.pausas.reduce((t, p) => t + p.minutos, 0), 0);
      const minutosBrutos = feito.reduce((s, f) => s + Math.max(0, minutos(f.fim) - minutos(f.inicio)), 0);
      const primeiroEscalado = escaladoFaixas[0]?.[0] ?? null;
      const atraso = primeiroEscalado !== null && feito.length ? minutos(feito[0].inicio) - primeiroEscalado : null;
      const jaComecou = d.dia < agora.dia || (d.dia === agora.dia && primeiroEscalado !== null && agora.minuto >= primeiroEscalado);
      const antesDoCheckin = !primeiroDia || d.dia < primeiroDia;
      let situacao: Presenca["situacao"];
      if (!escaladoFaixas.length) situacao = "extra";
      else if (!feito.length) situacao = !jaComecou ? "a_fazer" : antesDoCheckin ? "antes" : "faltou";
      else if (feito.some((f) => f.aberto)) situacao = "em_andamento";
      else situacao = atraso !== null && atraso > TOLERANCIA_ATRASO_MIN ? "atrasou" : "ok";
      r.push({
        dia: d.dia,
        equipeId: id,
        nome: nomeDe.get(id) ?? "?",
        escalado: escaladoFaixas.map(([a, b]) => ({ inicio: hhmm(a), fim: hhmm(b) })),
        feito,
        minutosEscalados,
        minutosFeitos: Math.max(0, minutosBrutos - minutosPausa),
        minutosPausa,
        atrasoMin: atraso !== null && atraso > 0 ? atraso : null,
        situacao,
      });
    }
  }
  return r.sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome));
}

/** "7h30" a partir de minutos. */
export function horas(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m}min`;
}

/**
 * Operação descoberta (aviso mais importante): o que fazer agora.
 * - "descobriu": no horário de atendimento, em dia com horário fixo, ninguém online (pausa não
 *   conta) e ainda não tinha avisado → avisa;
 * - "cobriu": estava descoberta e alguém ficou online dentro do horário → avisa que cobriu;
 * - "limpar": estava descoberta, mas acabou o horário (ou o dia não tem horário fixo) → só esquece;
 * - "nada": segue como estava (inclusive descoberta já avisada: não repete).
 */
export function decidirDescoberta(o: { agoraMin: number; inicio: string; fim: string; diaComFixo: boolean; online: number; jaDescobertaDesde: string | null }):
  | "descobriu"
  | "cobriu"
  | "limpar"
  | "nada" {
  const noHorario = o.diaComFixo && o.agoraMin >= minutos(o.inicio) && o.agoraMin < minutos(o.fim);
  if (noHorario && o.online === 0) return o.jaDescobertaDesde ? "nada" : "descobriu";
  if (!o.jaDescobertaDesde) return "nada";
  return noHorario && o.online > 0 ? "cobriu" : "limpar";
}

