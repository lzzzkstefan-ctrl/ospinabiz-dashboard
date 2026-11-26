// System prompt do gerador de criativos. Só no servidor: o texto do agente nunca vai pro navegador.
// Fonte: docs/modulos/criativos-agente.md (do "## 1. Quem você é" em diante). O arquivo entra no pacote
// da Vercel por `outputFileTracingIncludes` no next.config.ts.

import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BlocoSistema } from "@/lib/integracoes/anthropic";

const ARQUIVO_AGENTE = path.join(process.cwd(), "docs", "modulos", "criativos-agente.md");
const INICIO = "## 1. Quem você é";
export const MAX_APRENDIZADOS = 20;

let agenteEmMemoria: string | null = null;

/** Texto do agente (lido uma vez por instância do servidor). */
export async function textoDoAgente(): Promise<string> {
  if (agenteEmMemoria) return agenteEmMemoria;
  const bruto = await readFile(ARQUIVO_AGENTE, "utf8");
  const i = bruto.indexOf(INICIO);
  if (i === -1) throw new Error(`docs/modulos/criativos-agente.md sem a seção "${INICIO}"`);
  agenteEmMemoria = bruto.slice(i).trim();
  return agenteEmMemoria;
}

export type Aprendizado = { tipo: "venceu" | "perdeu"; motivo: string; criado_em: string; titulo: string | null; angulo: string | null; hook: string | null };

const NO_DASHBOARD = `## Como você está rodando agora

Você está dentro do dashboard da operação (aba Criativos), não numa conversa. Cada pedido traz o modo e
o que foi colado. Responda só no formato JSON pedido, sem texto fora dele. Não dá pra fazer pergunta de
volta: se faltar alguma informação do produto, não invente; escreva em volta do que você sabe e deixe
claro no próprio campo o que precisa ser confirmado (ex.: "(confirmar: nome da tela do app)").
Instruções de gravação vão entre parênteses. Não use markdown dentro dos campos, só texto corrido.`;

function blocoAprendizados(lista: Aprendizado[]): string {
  if (!lista.length) return "## Memória da operação\n\nAinda não tem criativo marcado como venceu ou perdeu.";
  const linhas = lista.map((a) => {
    const dia = a.criado_em.slice(0, 10).split("-").reverse().join("/");
    const partes = [`${a.tipo === "venceu" ? "VENCEU" : "PERDEU"} (${dia})`, a.titulo && `"${a.titulo}"`, a.angulo && `ângulo: ${a.angulo}`, a.hook && `hook: "${a.hook}"`, `motivo: ${a.motivo}`];
    return `- ${partes.filter(Boolean).join(" · ")}`;
  });
  return `## Memória da operação (últimos ${lista.length}, do mais novo pro mais velho)\n\nUse isso pra puxar as próximas variações pro que está funcionando e fugir do que não deu.\n\n${linhas.join("\n")}`;
}

/**
 * System prompt em blocos: o agente (fixo, guardado em cache na Anthropic: as próximas chamadas pagam ~5% da
 * entrada dele) e depois a memória da operação, que muda quando alguém marca venceu/perdeu.
 */
export async function montarSistema(aprendizados: Aprendizado[]): Promise<BlocoSistema[]> {
  return [
    { texto: `${await textoDoAgente()}\n\n${NO_DASHBOARD}`, guardarEmCache: true },
    { texto: blocoAprendizados(aprendizados) },
  ];
}
