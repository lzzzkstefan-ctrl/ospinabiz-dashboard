-- Vendas sem utm_term (20/10/2026, pedido do Davi): venda da Hubla sem código no link, ou com
-- código vazio/desconhecido, vai para o "dono das vendas sem utm" (hoje o Rodrigo), em vez de
-- ficar "A atribuir". Ele não está em vendedores: não tem aba, fechamento nem comissão.
-- A pessoa fica em vendas_config (dado no banco, não no código); vazio = volta a "A atribuir".
-- Contexto em docs/modulos/vendas.md ("Venda sem utm_term").

alter table public.vendas_config
  add column dono_sem_utm bigint references public.equipe (id);

comment on column public.vendas_config.dono_sem_utm is
  'Pessoa da equipe que fica com as vendas sem utm_term (ou com código desconhecido). Sem comissão e sem push de venda/reembolso.';

create index vendas_config_dono_sem_utm_idx on public.vendas_config (dono_sem_utm);

-- forma da atribuição: 'sem_utm' = foi para o dono das vendas sem utm (pelo webhook ou no reprocessamento)
alter table public.vendas drop constraint vendas_forma_atribuicao_check;
alter table public.vendas add constraint vendas_forma_atribuicao_check
  check (forma_atribuicao in ('utm', 'manual', 'sem_utm'));

alter table public.vendas_atribuicoes drop constraint vendas_atribuicoes_forma_check;
alter table public.vendas_atribuicoes add constraint vendas_atribuicoes_forma_check
  check (forma in ('utm', 'e_minha', 'admin', 'sem_utm'));
