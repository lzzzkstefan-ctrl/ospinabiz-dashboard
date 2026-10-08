// Integração com a WhatsApp Cloud API (Meta):
// - enviar template (META_PHONE_NUMBER_ID, META_ACCESS_TOKEN, META_TEMPLATE_NAME, META_TEMPLATE_LANG);
// - conferir assinatura do webhook (META_APP_SECRET).
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
