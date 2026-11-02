-- Aba Funil igual para todos (pedido do Davi, 02/11/2026): vendedor vê o panorama da equipe, como o admin.
-- Antes o RLS de funil_leads, funil_eventos, funil_conversas, funil_atendentes e vendas devolvia ao
-- vendedor só as linhas dele. As políticas NÃO mudam (Início, Webinários e Vendas continuam filtrados):
-- a aba Funil passa a ler destas visões.
--
-- São visões do dono (security_invoker = false), que ignoram o RLS de propósito, por isso:
-- - só SELECT para authenticated: ninguém grava por aqui, e anon não lê;
-- - só colunas que a tela usa: nome completo e telefone do lead (funil_leads_contato) não entram;
-- - vendas só em quantidade por dia e vendedor: valor, comissão e comprador não entram;
-- - número interno (teste) fica de fora.

create view public.funil_leads_equipe with (security_invoker = false) as
select dc_id, dia, criado_em, primeira_msg_lead_em, primeira_resposta_em, primeira_resposta_por,
       vendedor_id, atendente_dc_id, numero_dc_id, compra, etiquetas_atuais, interno
  from public.funil_leads
 where not interno;

create view public.funil_eventos_equipe with (security_invoker = false) as
select e.id, e.lead_dc_id, e.etiqueta_dc_id, e.acao, e.em, e.origem
  from public.funil_eventos e;

create view public.funil_conversas_equipe with (security_invoker = false) as
select dc_id, lead_dc_id, contato_rotulo, atendente_dc_id, vendedor_id, numero_dc_id, etiquetas_atuais,
       ultima_recebida_em, ultima_enviada_em, statuses, fila_desde, finalizada, interno
  from public.funil_conversas
 where not interno;

create view public.funil_atendentes_equipe with (security_invoker = false) as
select dc_id, nome, equipe_id, suporte_dc
  from public.funil_atendentes;

create view public.funil_vendas_equipe with (security_invoker = false) as
select data, vendedor_id, count(*)::integer as vendas
  from public.vendas
 where status = 'pago' and not aguardando_confirmacao and vendedor_id is not null
 group by data, vendedor_id;

revoke all on public.funil_leads_equipe, public.funil_eventos_equipe, public.funil_conversas_equipe,
              public.funil_atendentes_equipe, public.funil_vendas_equipe
  from public, anon, authenticated;
grant select on public.funil_leads_equipe, public.funil_eventos_equipe, public.funil_conversas_equipe,
                public.funil_atendentes_equipe, public.funil_vendas_equipe
  to authenticated;

notify pgrst, 'reload schema';
