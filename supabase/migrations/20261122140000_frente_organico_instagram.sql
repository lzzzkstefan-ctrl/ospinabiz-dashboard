-- Frente nova: Orgânico · Instagram (22/11/2026, pedido do Davi).
-- Reel pede um comentário com uma palavra → DM automática com botão (aba Instagram do
-- painel admin do GCS) → WhatsApp → venda de produto barato (skill ~R$ 10).
-- Idempotente: não duplica se já existir.
insert into public.frentes (slug, nome, status, ordem, objetivo, canal, estrategia)
values (
  'organico-instagram',
  'Orgânico · Instagram',
  'testando',
  5,
  'Levantar caixa com tráfego orgânico: transformar comentário de Reel em lead no WhatsApp e venda de produto barato.',
  'Instagram (Reels) → comentário com palavra-chave → DM automática com botão → WhatsApp',
  'Postar Reel pedindo pra comentar uma palavra. A automação (GCS admin → Instagram) manda a DM na hora com o botão. '
  || 'Medir por palavra: DMs → foram pro WhatsApp → compraram. Teste de ago/out: "CLAUDE" 66 DMs → 10 no WhatsApp → R$ 120; '
  || '"Clone" 1.488 DMs → 0. Palavra que atrai curioso gasta cota de DM e não vende. Chamar no WhatsApp todo mundo que clicou.'
)
on conflict (slug) do nothing;
