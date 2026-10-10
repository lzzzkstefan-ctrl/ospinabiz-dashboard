-- Funil: filas da Data Crazy pelos status da conversa (correção de 10/10/2026).
--
-- Os `statuses` da API são marcas que se somam, não uma fila só. Ex.: ["waiting", "opened"]
-- (Aguardando E Em aberto), ["automation", "unstarted"] (robô E Não iniciado). Como no CRM, cada
-- aba mostra as conversas com aquela marca:
--   opened = Em aberto · unstarted = Não iniciados · waiting = Aguardando · automation = Com automação
--
-- A coluna `fila` (uma fila só por conversa, criada hoje na funil_filas_internos) dava errado:
-- o atendimento #37096 ("waiting" + "opened") ia para Em aberto e o Aguardando ficava 0.
-- Entra `statuses` (a lista crua da API; vazia quando a conversa está fechada). A `fila` deixa de
-- ser usada e sai numa migration depois do deploy (o código no ar ainda grava nela).

alter table public.funil_conversas add column statuses text[] not null default '{}';

comment on column public.funil_conversas.statuses is
  'Status da conversa aberta na Data Crazy (statuses da API: opened, unstarted, waiting, automation...). Vazio = fechada.';
comment on column public.funil_conversas.fila is
  'NÃO USADA desde 10/10/2026 (substituída por statuses). Sai numa próxima migration.';
