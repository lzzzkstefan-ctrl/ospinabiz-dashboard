-- Conversa que não vem mais na API da Data Crazy (pedido do Davi, 02/11/2026). A sincronização só atualiza
-- o que a API devolve, então uma conversa que sumiu (ex.: número desconectado ou banido) ficava aberta para
-- sempre no banco. Nada é apagado: a sincronização marca aqui quando notou a falta e, se continuar faltando
-- na rodada seguinte, encerra a conversa. Se ela voltar na API, a marca sai e vale o que a API disser.
alter table public.funil_conversas add column sumiu_da_api_em timestamptz;

comment on column public.funil_conversas.sumiu_da_api_em is
  'Quando a sincronização notou que a conversa não veio mais na API da Data Crazy. Com finalizada = true: encerrada por isso. Vazio = veio na última leitura.';
