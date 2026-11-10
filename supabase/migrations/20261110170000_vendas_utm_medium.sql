-- Atendente no utm_medium (10/11/2026, pedido do Davi): a Hubla passou a mandar o atendente em
-- utm.medium (ex.: medium "davi", term = telefone do lead, content "lead_<telefone>"); vendas antigas e
-- alguns links ainda trazem o atendente em utm.term. A regra nova fica no código
-- (modulos/vendas/regras.ts, vendedorDasUtms): vale o medium se for de um vendedor; senão, o term.
-- Aqui: guardar o medium no evento e na venda, preencher os eventos já recebidos e devolver ao
-- vendedor certo as vendas que foram para o dono das vendas sem utm só por causa do formato novo.
-- Contexto em docs/modulos/vendas.md ("Nome do atendente nas UTMs").

alter table public.hubla_eventos add column utm_medium text;
alter table public.vendas add column utm_medium text;

comment on column public.hubla_eventos.utm_medium is
  'utm.medium do link (paymentSession ou, sem ele, firstPaymentSession). Formato novo da Hubla: nome do atendente.';
comment on column public.vendas.utm_medium is
  'utm.medium do link da venda. Formato novo da Hubla: nome do atendente (o utm_term vira o telefone do lead).';
comment on column public.vendedores.utm_term is
  'Nome do atendente nas UTMs (vale para utm_medium e utm_term). O nome da coluna ficou o antigo.';

-- 1) eventos já recebidos: o medium sai do payload bruto (mesmo caminho do código)
update public.hubla_eventos e
   set utm_medium = coalesce(
         nullif(btrim(e.payload #>> '{event,invoice,paymentSession,utm,medium}'), ''),
         nullif(btrim(e.payload #>> '{event,invoice,firstPaymentSession,utm,medium}'), ''))
 where e.utm_medium is null;

-- 2) vendas criadas pelo webhook: copia o medium do evento que criou a venda
update public.vendas v
   set utm_medium = e.utm_medium,
       alterado_via = 'hubla'
  from public.hubla_eventos e
 where e.venda_id = v.id
   and e.resultado in ('venda_criada', 'venda_criada_ja_reembolsada')
   and e.utm_medium is not null
   and v.utm_medium is null
   -- mês fechado não aceita mudança do webhook fora do status: essas ficam sem o medium
   and not privado.vendas_mes_fechado(v.data, v.vendedor_id);

-- 3) vendas que foram para o dono das vendas sem utm (forma 'sem_utm', ninguém mexeu à mão) mas
--    têm o nome de um vendedor ativo no medium: voltam para esse vendedor, como se o webhook já
--    conhecesse o formato novo. Só em mês aberto. Fica no histórico de atribuições.
create temporary table utm_medium_corrigir as
select v.id as venda_id, v.vendedor_id as de_id, vd.equipe_id as para_id
  from public.vendas v
  join public.vendedores vd
    on vd.ativo
   and lower(regexp_replace(vd.utm_term, '\s+', '', 'g')) = lower(regexp_replace(v.utm_medium, '\s+', '', 'g'))
 where v.forma_atribuicao = 'sem_utm'
   and v.origem = 'webhook'
   and v.utm_medium is not null
   and not privado.vendas_mes_fechado(v.data, v.vendedor_id)
   and not privado.vendas_mes_fechado(v.data, vd.equipe_id);

update public.vendas v
   set vendedor_id = c.para_id,
       forma_atribuicao = 'utm',
       atribuida_em = now(),
       atualizado_em = now(),
       alterado_via = 'hubla'
  from utm_medium_corrigir c
 where v.id = c.venda_id;

insert into public.vendas_atribuicoes (venda_id, de_vendedor_id, para_vendedor_id, forma)
select venda_id, de_id, para_id, 'utm' from utm_medium_corrigir;

-- pedido de reembolso já aberto dessas vendas acompanha o dono novo
update public.vendas_reembolsos r
   set vendedor_id = c.para_id
  from utm_medium_corrigir c
 where r.venda_id = c.venda_id;

drop table utm_medium_corrigir;
