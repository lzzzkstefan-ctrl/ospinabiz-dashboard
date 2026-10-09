-- Vendas: líquido de ticket pela fatura real (decisão do Davi, 09/10/2026).
--
-- A partir do mês em vendas_config.liquido_real_desde (o primeiro mês ainda não pago):
--   bruto de ticket   = preço do ticket na tabela (juros do parcelamento NÃO entram);
--   líquido de ticket = o que realmente fica para a operação na fatura, na parte do ticket:
--                       receita_liquida × (preço do ticket ÷ subtotal da fatura [valor_pago]).
--                       Sem bump, é o líquido da fatura inteiro.
--   comissão (6..10%) = % × esse líquido, meio centavo para cima (igual ao comissaoDe).
-- Antes desse mês, ou sem os valores da fatura: continua a tabela de tickets (como sempre foi).
-- Vazio (null) = regra nova desligada.
--
-- Quando recalcula a cópia (snap_*) da venda:
--   - ao nascer ou ao trocar o ticket (como antes);
--   - quando chegam/mudam receita_liquida, valor_pago ou a data E a venda está no período da
--     regra nova (venda antiga fora do período NUNCA é recalculada pela tabela atual).
-- Mês fechado continua protegido pela trava (vendas_trava_mes_fechado): a comissão congelada no
-- fechamento não muda.

alter table public.vendas_config
  add column liquido_real_desde date check (liquido_real_desde is null or extract(day from liquido_real_desde) = 1);

comment on column public.vendas_config.liquido_real_desde is
  'Primeiro mês em que o líquido de ticket vem da fatura real (receita_liquida proporcional ao ticket). Null = desligado.';

create or replace function privado.vendas_snapshot_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t         record;
  desde     date;
  usa_real  boolean;
  ticket_mudou boolean := tg_op = 'INSERT' or new.ticket_id is distinct from old.ticket_id;
  liq_cent  bigint;
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
    return new;
  end if;

  select c.liquido_real_desde into desde from public.vendas_config c where c.id;
  usa_real := desde is not null
              and new.data >= desde
              and new.receita_liquida is not null
              and coalesce(new.valor_pago, 0) > 0;

  -- fora da regra nova, só copia quando o ticket muda (venda antiga não é recalculada)
  if not ticket_mudou and not usa_real then
    return new;
  end if;

  select * into t from public.tickets where id = new.ticket_id;

  if usa_real then
    liq_cent := round(new.receita_liquida * t.valor_bruto / new.valor_pago * 100);
    new.snap_bruto       := t.valor_bruto;
    new.snap_liquido     := liq_cent / 100.0;
    new.snap_comissao_6  := floor((liq_cent * 6  + 50) / 100) / 100.0;
    new.snap_comissao_7  := floor((liq_cent * 7  + 50) / 100) / 100.0;
    new.snap_comissao_8  := floor((liq_cent * 8  + 50) / 100) / 100.0;
    new.snap_comissao_9  := floor((liq_cent * 9  + 50) / 100) / 100.0;
    new.snap_comissao_10 := floor((liq_cent * 10 + 50) / 100) / 100.0;
  else
    new.snap_bruto       := t.valor_bruto;
    new.snap_liquido     := t.valor_liquido;
    new.snap_comissao_6  := t.comissao_6;
    new.snap_comissao_7  := t.comissao_7;
    new.snap_comissao_8  := t.comissao_8;
    new.snap_comissao_9  := t.comissao_9;
    new.snap_comissao_10 := t.comissao_10;
  end if;
  return new;
end $$;

revoke execute on function privado.vendas_snapshot_ticket() from public, anon, authenticated;

drop trigger vendas_snapshot_ticket on public.vendas;
create trigger vendas_snapshot_ticket
  before insert or update of ticket_id, receita_liquida, valor_pago, data on public.vendas
  for each row execute function privado.vendas_snapshot_ticket();
