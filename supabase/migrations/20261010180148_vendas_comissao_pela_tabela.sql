-- Vendas: comissão SEMPRE pela tabela de tickets (decisão do Davi, 10/10/2026).
--
-- Antes (migration vendas_liquido_real, 09/10): a partir de outubro/2026, o líquido de ticket e a
-- comissão saíam da fatura real (receita_liquida × ticket ÷ subtotal), juros do parcelamento
-- incluídos. Ex.: outubro do Davi a 10% dava R$ 55,58.
-- Agora: líquido de ticket e comissão = tabela de tickets, como sempre foi (outubro do Davi a 10% =
-- R$ 54,66). O valor com juros vira só informação: "recebido real" (vendas.liquido_real), mostrado
-- na visão Geral, nunca na comissão.
--
-- 1. vendas.liquido_real: parte do ticket no que a operação realmente recebeu da fatura
--    (receita_liquida × preço do ticket ÷ subtotal), a partir de vendas_config.liquido_real_desde.
-- 2. O gatilho da cópia (snap_*) volta a copiar só a tabela (ao nascer ou trocar o ticket) e
--    calcula o liquido_real à parte.
-- 3. Outubro (o único mês no período, aberto) é recalculado pela tabela.
-- 4. Geral completa ganha a coluna recebido_real (soma do liquido_real).

alter table public.vendas add column liquido_real numeric(10, 2);
comment on column public.vendas.liquido_real is
  'Só informação: parte do ticket no valor recebido de verdade da fatura (com juros do parcelamento). A comissão usa a tabela (snap_*).';
comment on column public.vendas_config.liquido_real_desde is
  'A partir deste mês guarda o "recebido real" (vendas.liquido_real) de cada venda. Não muda a comissão (sempre pela tabela).';

create or replace function privado.vendas_snapshot_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t            record;
  desde        date;
  ticket_mudou boolean := tg_op = 'INSERT' or new.ticket_id is distinct from old.ticket_id;
begin
  if new.ticket_id is null then
    if ticket_mudou then
      new.snap_bruto := null;
      new.snap_liquido := null;
      new.snap_comissao_6 := null;
      new.snap_comissao_7 := null;
      new.snap_comissao_8 := null;
      new.snap_comissao_9 := null;
      new.snap_comissao_10 := null;
    end if;
    new.liquido_real := null;
    return new;
  end if;

  select * into t from public.tickets where id = new.ticket_id;

  -- comissão: sempre a tabela, copiada ao nascer ou ao trocar o ticket (venda antiga nunca é
  -- recalculada por mudança na tabela)
  if ticket_mudou then
    new.snap_bruto       := t.valor_bruto;
    new.snap_liquido     := t.valor_liquido;
    new.snap_comissao_6  := t.comissao_6;
    new.snap_comissao_7  := t.comissao_7;
    new.snap_comissao_8  := t.comissao_8;
    new.snap_comissao_9  := t.comissao_9;
    new.snap_comissao_10 := t.comissao_10;
  end if;

  -- recebido real (só informação), a partir de liquido_real_desde
  select c.liquido_real_desde into desde from public.vendas_config c where c.id;
  if desde is not null and new.data >= desde and new.receita_liquida is not null and coalesce(new.valor_pago, 0) > 0 then
    new.liquido_real := round(new.receita_liquida * t.valor_bruto / new.valor_pago, 2);
  else
    new.liquido_real := null;
  end if;
  return new;
end $$;

revoke execute on function privado.vendas_snapshot_ticket() from public, anon, authenticated;

-- outubro (e o que vier depois, se houver) pela tabela + recebido real à parte
update public.vendas v
   set snap_bruto       = t.valor_bruto,
       snap_liquido     = t.valor_liquido,
       snap_comissao_6  = t.comissao_6,
       snap_comissao_7  = t.comissao_7,
       snap_comissao_8  = t.comissao_8,
       snap_comissao_9  = t.comissao_9,
       snap_comissao_10 = t.comissao_10,
       liquido_real     = case when v.receita_liquida is not null and coalesce(v.valor_pago, 0) > 0
                               then round(v.receita_liquida * t.valor_bruto / v.valor_pago, 2) end
  from public.tickets t, public.vendas_config c
 where c.id
   and t.id = v.ticket_id
   and c.liquido_real_desde is not null
   and v.data >= c.liquido_real_desde;

-- Geral completa: + recebido_real (o tipo de retorno muda: precisa recriar a função)
drop function public.vendas_geral_completa(date, date);
create function public.vendas_geral_completa(p_inicio date, p_fim date)
returns table (
  vendedor_id bigint, pagas integer, reembolsos integer, chargebacks integer,
  bruto numeric, liquido numeric,
  comissao_6 numeric, comissao_7 numeric, comissao_8 numeric, comissao_9 numeric, comissao_10 numeric,
  receita numeric, sem_receita integer, recebido_real numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select privado.vendas_geral_completa()) then
    raise exception 'Sem acesso à Geral completa.';
  end if;
  return query
  select v.vendedor_id,
         (count(*) filter (where v.status = 'pago'))::integer,
         (count(*) filter (where v.status = 'reembolso'))::integer,
         (count(*) filter (where v.status = 'chargeback'))::integer,
         coalesce(sum(v.snap_bruto)       filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_liquido)     filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_6)  filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_7)  filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_8)  filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_9)  filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_10) filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.receita_liquida)  filter (where v.status = 'pago'), 0),
         (count(*) filter (where v.status = 'pago' and v.receita_liquida is null))::integer,
         coalesce(sum(v.liquido_real)     filter (where v.status = 'pago' and v.ticket_id is not null), 0)
    from public.vendas v
   where v.data >= p_inicio and v.data < p_fim
     and not v.teste and not v.aguardando_confirmacao
   group by v.vendedor_id;
end;
$$;

revoke execute on function public.vendas_geral_completa(date, date) from public, anon;
grant execute on function public.vendas_geral_completa(date, date) to authenticated;
