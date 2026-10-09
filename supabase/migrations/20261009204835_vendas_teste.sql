-- Vendas: marca "venda de teste" (decisão do Davi, 09/10/2026).
-- Venda de teste continua no banco (a fatura existiu na Hubla), mas fica FORA da
-- "Receita na Hubla (com bumps)" da visão geral, e o script de receita não a preenche de novo.
-- Comissão: teste não tem vendedor nem conta como venda de ninguém (quem marca é o admin).
-- Em mês fechado, marcar segue a trava (admin identificado, registrado em vendas_alteracoes).

alter table public.vendas
  add column teste boolean not null default false;

comment on column public.vendas.teste is
  'Venda de teste: fica fora da receita da operação (visão geral). Marcada pelo admin.';
