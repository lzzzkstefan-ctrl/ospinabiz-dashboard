// Integração com a WhatsApp Cloud API (Meta):
// - enviar template (META_PHONE_NUMBER_ID, META_ACCESS_TOKEN, META_TEMPLATE_NAME, META_TEMPLATE_LANG);
// - conferir assinatura do webhook (META_APP_SECRET);
// - mandar o template de aviso da equipe (META_TEMPLATE_AVISO_NAME, META_TEMPLATE_AVISO_LANG).
// Sem regra de negócio aqui: só falar com a Meta.

/** As variáveis do número remetente e do template já foram configuradas? */
export function metaConfigurada(): boolean {
  return Boolean(
    process.env.META_PHONE_NUMBER_ID &&
      process.env.META_ACCESS_TOKEN &&
      process.env.META_TEMPLATE_NAME &&
      process.env.META_TEMPLATE_LANG,
  );
}

const GRAPH = "https://graph.facebook.com/v25.0";

/** Um dia de custo da Meta (pricing analytics da WABA). `inicio` em segundos (UTC). */
export type PontoCustoMeta = { inicio: number; tipo: string; categoria: string; mensagens: number; custo: number };

/**
 * Custo por dia das mensagens de uma conta do WhatsApp (WABA), na moeda da conta.
 * Token: usuário do sistema com a permissão whatsapp_business_management e a WABA como ativo
 * (META_CUSTO_TOKEN; passado por quem chama, nunca guardado aqui). Lança erro se a Meta recusar.
 */
export async function custoDaWaba(token: string, wabaId: string, inicio: number, fim: number): Promise<{ moeda: string | null; pontos: PontoCustoMeta[] }> {
  const campos =
    `currency,pricing_analytics.start(${inicio}).end(${fim}).granularity(DAILY)` + `.dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`;
  const r = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}?fields=${encodeURIComponent(campos)}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  type Ponto = { start: number; volume?: number; cost?: number; pricing_type?: string; pricing_category?: string };
  const corpo = (await r.json().catch(() => ({}))) as {
    currency?: string;
    pricing_analytics?: { data?: { data_points?: Ponto[] }[] };
    error?: { message?: string; code?: number };
  };
  if (!r.ok) throw new Error(`Meta ${r.status}${corpo.error?.code ? ` (${corpo.error.code})` : ""}: ${corpo.error?.message ?? "sem detalhe"}`.slice(0, 300));
  const pontos = (corpo.pricing_analytics?.data ?? []).flatMap((d) => d.data_points ?? []);
  return {
    moeda: corpo.currency ?? null,
    pontos: pontos.map((p) => ({
      inicio: p.start,
      tipo: p.pricing_type ?? "?",
      categoria: p.pricing_category ?? "?",
      mensagens: p.volume ?? 0,
      custo: p.cost ?? 0,
    })),
  };
}

/** Template de aviso livre (um parâmetro {{1}} com o texto), usado pelas mensagens automáticas da equipe. */
export function avisoWhatsAppConfigurado(): boolean {
  return Boolean(process.env.META_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN && process.env.META_TEMPLATE_AVISO_NAME);
}

/** O que a Meta respondeu a um envio. "sem_canal" = remetente ou template de aviso não configurado. */
export type EnvioWhatsApp = { situacao: "ok" | "erro" | "sem_canal"; detalhe?: string };

/**
 * Manda o template de aviso (META_TEMPLATE_AVISO_NAME, idioma META_TEMPLATE_AVISO_LANG, padrão pt_BR)
 * com `texto` no {{1}}. A Meta não aceita quebra de linha nem tab em parâmetro: viram espaço.
 * Nunca lança erro: devolve o que aconteceu.
 */
export async function enviarAvisoWhatsApp(para: string, texto: string): Promise<EnvioWhatsApp> {
  if (!avisoWhatsAppConfigurado()) return { situacao: "sem_canal", detalhe: "remetente ou template de aviso da Meta não configurado" };
  try {
    const r = await fetch(`${GRAPH}/${process.env.META_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: para.replace(/\D/g, ""),
        type: "template",
        template: {
          name: process.env.META_TEMPLATE_AVISO_NAME,
          language: { code: process.env.META_TEMPLATE_AVISO_LANG || "pt_BR" },
          components: [{ type: "body", parameters: [{ type: "text", text: texto.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, 1000) }] }],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const corpo = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
    if (!r.ok) return { situacao: "erro", detalhe: `Meta ${r.status}${corpo.error?.code ? ` (${corpo.error.code})` : ""}: ${corpo.error?.message ?? "sem detalhe"}`.slice(0, 300) };
    return { situacao: "ok" };
  } catch (e) {
    return { situacao: "erro", detalhe: String(e instanceof Error ? e.message : e).slice(0, 300) };
  }
}
