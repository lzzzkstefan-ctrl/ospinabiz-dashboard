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
