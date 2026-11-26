// Conversa com a API da Anthropic (Claude). Só fala com o serviço: quem decide o que pedir, o que salvar
// e quanto pode gastar é modulos/criativos. Chave em ANTHROPIC_API_KEY (.env.local e Vercel), nunca no código.
//
// Modelo: Claude Sonnet 5.5 (`claude-sonnet-5-5`), o Sonnet mais novo em 26/11/2026 (tabela de modelos da
// Anthropic). Preço: US$ 2 por milhão de tokens de entrada, US$ 10 por milhão de saída; leitura de cache
// US$ 0,10 e escrita de cache ~1,25x a entrada (US$ 2,50).
//
// Resposta sempre em JSON com formato fixo (structured outputs: `output_config.format`). A conferência
// do JSON fica aqui, com o schema que o módulo manda, pra devolver o uso de tokens mesmo quando a
// resposta vier quebrada (o gasto conta igual).
//
// Recusa: se o filtro de segurança da Anthropic recusar, a própria API tenta de novo num modelo reserva
// (`fallbacks: "default"`, beta server-side-fallback-2026-07-01). Se mesmo assim recusar, volta "recusou".

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODELO_CLAUDE = "claude-sonnet-5-5";

/** US$ por milhão de tokens. Modelo desconhecido (ex.: um reserva) usa o preço do Sonnet: é estimativa. */
const PRECO_USD_POR_MILHAO: Record<string, { entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number }> = {
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheEscrita: 2.5, cacheLeitura: 0.1 },
  "claude-sonnet-5": { entrada: 2, saida: 10, cacheEscrita: 2.5, cacheLeitura: 0.2 },
};

export type UsoTokens = { entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number };

export const usoZerado = (): UsoTokens => ({ entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 });

export function somarUso(a: UsoTokens, b: UsoTokens): UsoTokens {
  return { entrada: a.entrada + b.entrada, saida: a.saida + b.saida, cacheEscrita: a.cacheEscrita + b.cacheEscrita, cacheLeitura: a.cacheLeitura + b.cacheLeitura };
}

/** Custo em dólar do uso informado. */
export function custoUSD(uso: UsoTokens, modelo: string): number {
  const p = PRECO_USD_POR_MILHAO[modelo] ?? PRECO_USD_POR_MILHAO[MODELO_CLAUDE];
  return (uso.entrada * p.entrada + uso.saida * p.saida + uso.cacheEscrita * p.cacheEscrita + uso.cacheLeitura * p.cacheLeitura) / 1_000_000;
}

export type BlocoSistema = { texto: string; guardarEmCache?: boolean };

export type Esforco = "low" | "medium" | "high";

export type ResultadoJson<T> =
  | { ok: true; dados: T; uso: UsoTokens; modelo: string }
  | { ok: false; motivo: "json_quebrado" | "cortado" | "recusou" | "sem_chave" | "erro_api"; detalhe: string; uso: UsoTokens; modelo: string };

export function temChaveAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * Uma chamada ao Claude pedindo JSON no formato do `schema`. Em streaming (respostas longas não batem no
 * tempo limite do HTTP); o resultado só volta inteiro, no fim.
 */
export async function gerarJson<T>(opcoes: { sistema: BlocoSistema[]; pedido: string; schema: z.ZodType<T>; esforco?: Esforco; maxTokens?: number }): Promise<ResultadoJson<T>> {
  const uso = usoZerado();
  if (!temChaveAnthropic()) return { ok: false, motivo: "sem_chave", detalhe: "ANTHROPIC_API_KEY não configurada.", uso, modelo: MODELO_CLAUDE };

  const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim() });
  // só o formato (sem o parse automático do SDK): quem confere é a gente, logo abaixo
  const { schema } = betaZodOutputFormat(opcoes.schema);

  try {
    const stream = cliente.beta.messages.stream({
      model: MODELO_CLAUDE,
      max_tokens: opcoes.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opcoes.sistema.map((b) => ({
        type: "text" as const,
        text: b.texto,
        ...(b.guardarEmCache ? { cache_control: { type: "ephemeral" as const } } : {}),
      })),
      output_config: { effort: opcoes.esforco ?? "high", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: opcoes.pedido }],
    });
    const msg = await stream.finalMessage();
    const u = msg.usage;
    const usoMsg: UsoTokens = {
      entrada: u.input_tokens ?? 0,
      saida: u.output_tokens ?? 0,
      cacheEscrita: u.cache_creation_input_tokens ?? 0,
      cacheLeitura: u.cache_read_input_tokens ?? 0,
    };
    const modelo = msg.model || MODELO_CLAUDE;

    if (msg.stop_reason === "refusal") {
      return { ok: false, motivo: "recusou", detalhe: msg.stop_details?.explanation ?? "A IA recusou o pedido.", uso: usoMsg, modelo };
    }
    if (msg.stop_reason === "max_tokens") {
      return { ok: false, motivo: "cortado", detalhe: "A resposta passou do tamanho máximo.", uso: usoMsg, modelo };
    }
    const texto = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch {
      return { ok: false, motivo: "json_quebrado", detalhe: "A resposta não veio em JSON.", uso: usoMsg, modelo };
    }
    const conferido = opcoes.schema.safeParse(bruto);
    if (!conferido.success) {
      return { ok: false, motivo: "json_quebrado", detalhe: conferido.error.message.slice(0, 500), uso: usoMsg, modelo };
    }
    return { ok: true, dados: conferido.data, uso: usoMsg, modelo };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, motivo: "erro_api", detalhe: "Chave da Anthropic inválida.", uso, modelo: MODELO_CLAUDE };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, motivo: "erro_api", detalhe: "Limite de uso da Anthropic atingido. Tente de novo em 1 minuto.", uso, modelo: MODELO_CLAUDE };
    if (e instanceof Anthropic.APIError) {
      console.error("[anthropic]", e.status, e.message);
      return { ok: false, motivo: "erro_api", detalhe: `A API da Anthropic respondeu erro ${e.status ?? ""}.`.trim(), uso, modelo: MODELO_CLAUDE };
    }
    console.error("[anthropic]", e);
    return { ok: false, motivo: "erro_api", detalhe: "Não deu para falar com a Anthropic.", uso, modelo: MODELO_CLAUDE };
  }
}
