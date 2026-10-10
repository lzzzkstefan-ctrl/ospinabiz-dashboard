-- Funil: "Leads sem atendimento na chegada" (pedido do Davi, 10/10/2026).
--
-- 1. minutos_primeira_resposta: lead que chegou dentro do horário e não teve resposta de atendente
--    de verdade em até X minutos conta como "sem atendente na chegada". Padrão 30; o admin muda em
--    /funil/config.
--    (O horário 9h–22h foi trocado direto na configuração em 10/10/2026, a pedido do Davi.)

alter table public.funil_config
  add column minutos_primeira_resposta integer not null default 30
    check (minutos_primeira_resposta between 1 and 600);

comment on column public.funil_config.minutos_primeira_resposta is
  'Lead que chega dentro do horário e não tem resposta de atendente em até estes minutos = sem atendente na chegada.';

grant update (minutos_primeira_resposta) on public.funil_config to authenticated;
