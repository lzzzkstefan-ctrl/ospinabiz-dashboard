// Regras do Progresso (21/11/2026): quanto vale cada coisa feita, níveis, meta do dia e sequência.
// Sem tela, sem banco. Contexto em docs/modulos/gestao.md.

import { somarDias } from "./regras";

export type TipoRegistro = "entrega" | "negocio" | "conteudo" | "alinhamento" | "aprendizado" | "ajuste";
export type Tamanho = "p" | "m" | "g";
export type Origem = "registro" | "projeto" | "prioridade" | "decisao";

export const TIPOS_REGISTRO: { id: TipoRegistro; nome: string; cor: string }[] = [
  { id: "entrega", nome: "Entrega", cor: "--tag-verde" },
  { id: "negocio", nome: "Negócio / venda", cor: "--tag-amarelo" },
  { id: "conteudo", nome: "Conteúdo", cor: "--tag-rosa" },
  { id: "alinhamento", nome: "Alinhamento", cor: "--tag-azul" },
  { id: "aprendizado", nome: "Aprendizado", cor: "--tag-roxo" },
  { id: "ajuste", nome: "Ajuste", cor: "--tag-cinza" },
];
export const ehTipoRegistro = (v: unknown): v is TipoRegistro => TIPOS_REGISTRO.some((t) => t.id === v);

export const TAMANHOS: { id: Tamanho; nome: string; dica: string; xp: number }[] = [
  { id: "p", nome: "P", dica: "Coisa rápida (até 1h)", xp: 15 },
  { id: "m", nome: "M", dica: "Meio período", xp: 40 },
  { id: "g", nome: "G", dica: "O dia todo ou uma entrega grande", xp: 80 },
];
export const ehTamanho = (v: unknown): v is Tamanho => v === "p" || v === "m" || v === "g";
export const xpDoTamanho = (t: Tamanho) => TAMANHOS.find((x) => x.id === t)!.xp;

/** XP do que entra sozinho, vindo das outras abas. */
export const XP_AUTOMATICO: Record<Exclude<Origem, "registro">, number> = {
  projeto: 10, // item do checklist de um projeto marcado como feito
  prioridade: 50, // prioridade da semana concluída
  decisao: 20, // decisão tomada
};

export const NOME_ORIGEM: Record<Origem, string> = {
  registro: "Registro",
  projeto: "Projetos",
  prioridade: "Prioridade",
  decisao: "Decisão",
};

/** Meta de XP de um dia "que andou". */
export const META_DIA = 100;

export type Evento = {
  chave: string;
  dia: string;
  titulo: string;
  resultado: string | null;
  origem: Origem;
  tipo: TipoRegistro | null;
  tamanho: Tamanho | null;
  xp: number;
  link: string | null;
  quem: string | null;
  meu: boolean;
  registroId: number | null;
};

// ---------------------------------------------------------------------------
// Níveis: cada nível custa 100 XP a mais que o anterior (300, 400, 500...).
// ---------------------------------------------------------------------------
const NOMES_NIVEL = ["Aquecendo", "Em ritmo", "Constante", "Executor", "Máquina", "Imparável", "Lenda"];

export function nivelDe(xpTotal: number): { nivel: number; nome: string; noNivel: number; doNivel: number } {
  let nivel = 1;
  let custo = 300;
  let resto = Math.max(0, xpTotal);
  while (resto >= custo) {
    resto -= custo;
    nivel++;
    custo += 100;
  }
  return { nivel, nome: NOMES_NIVEL[Math.min(nivel - 1, NOMES_NIVEL.length - 1)], noNivel: resto, doNivel: custo };
}

/** XP somado por dia. */
export function xpPorDia(eventos: Evento[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of eventos) m.set(e.dia, (m.get(e.dia) ?? 0) + e.xp);
  return m;
}

/**
 * Dias seguidos com algum XP, terminando hoje. Se hoje ainda está zerado, conta até ontem
 * (a sequência só quebra se o dia acabar sem nada).
 */
export function sequencia(porDia: Map<string, number>, hoje: string): { dias: number; hojeConta: boolean } {
  const hojeConta = (porDia.get(hoje) ?? 0) > 0;
  let dia = hojeConta ? hoje : somarDias(hoje, -1);
  let dias = 0;
  while ((porDia.get(dia) ?? 0) > 0) {
    dias++;
    dia = somarDias(dia, -1);
  }
  return { dias, hojeConta };
}

/** Intensidade 0–4 de um dia no mapa de calor. */
export function intensidade(xp: number): 0 | 1 | 2 | 3 | 4 {
  if (xp <= 0) return 0;
  if (xp < META_DIA * 0.4) return 1;
  if (xp < META_DIA) return 2;
  if (xp < META_DIA * 2) return 3;
  return 4;
}

/** Recado curto do dia, pra quem acha que o dia foi perdido. */
export function recadoDoDia(xpHoje: number, itensHoje: number): string {
  if (xpHoje === 0) return "Ainda nada registrado hoje. Até um ajuste pequeno conta: registra o que você fez.";
  if (xpHoje < META_DIA) return `${itensHoje} ${itensHoje === 1 ? "coisa feita" : "coisas feitas"} hoje. Falta ${META_DIA - xpHoje} XP pra bater a meta do dia.`;
  if (xpHoje < META_DIA * 2) return "Meta do dia batida. O dia andou.";
  return "Dia forte: mais que o dobro da meta.";
}
