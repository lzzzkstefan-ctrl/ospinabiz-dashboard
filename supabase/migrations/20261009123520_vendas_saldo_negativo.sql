-- Vendas: saldo negativo do mês fechado vira estorno no próximo fechamento (decisão do Davi, 09/10/2026).
--
-- Saldo do mês fechado = comissão congelada − estornos descontados nele + ajustes − adiantamentos.
-- Se ficar negativo, existe UM estorno "saldo_negativo" do mês (sem venda) com esse valor,
-- descontado sozinho no próximo fechamento do vendedor, como os outros estornos.
-- O saldo é recalculado quando: o mês fecha, entra ajuste, ou muda adiantamento do mês fechado.
--   - ficou negativo  → cria ou atualiza o estorno do saldo (enquanto não foi descontado);
--   - voltou a ≥ 0    → cancela o estorno do saldo (enquanto não foi descontado);
--   - já descontado   → não muda mais (o mês seguinte já fechou com ele): corrija com ajuste lá.
-- Reabrir o mês já cancela o estorno do saldo pendente (regra dos estornos nascidos no mês).

-- estorno de saldo não tem venda nem faixa
alter table public.vendas_estornos
  alter column venda_id drop not null,
  alter column faixa drop not null,
  drop constraint vendas_estornos_motivo_check,
  add constraint vendas_estornos_motivo_check check (motivo in ('reembolso', 'chargeback', 'saldo_negativo')),
  add constraint vendas_estornos_saldo_sem_venda check ((motivo = 'saldo_negativo') = (venda_id is null)),
  add constraint vendas_estornos_venda_tem_faixa check (venda_id is null or faixa is not null);

-- um estorno de saldo valendo por vendedor e mês
create unique index vendas_estornos_saldo_unico on public.vendas_estornos (vendedor_id, mes_origem)
  where motivo = 'saldo_negativo' and cancelado_em is null;

-- ---------------------------------------------------------------------------
-- Recalcula o saldo de um mês fechado e acerta o estorno do saldo.
-- ---------------------------------------------------------------------------
create or replace function privado.vendas_recalcula_saldo(p_mes date, p_vendedor bigint)
returns void
language plpgsql
security definer  -- grava em estornos e no registro, que o usuário não edita
set search_path = ''
as $$
declare
  f      record;
  saldo  numeric;
  e      record;
begin
  select * into f from public.vendas_fechamentos where mes = p_mes and vendedor_id = p_vendedor;
  if not found then
    return;  -- mês aberto: não há saldo congelado
  end if;

  saldo := f.comissao
         - f.estornos
         + coalesce((select sum(valor) from public.vendas_ajustes where mes = p_mes and vendedor_id = p_vendedor), 0)
         - coalesce((select sum(valor) from public.vendas_adiantamentos where mes = p_mes and vendedor_id = p_vendedor), 0);

  select * into e from public.vendas_estornos
   where vendedor_id = p_vendedor and mes_origem = p_mes
     and motivo = 'saldo_negativo' and cancelado_em is null;

  if found and e.descontado_no_mes is not null then
    return;  -- já descontado no mês seguinte: não muda mais
  end if;

  if saldo < 0 then
    if not found then
      insert into public.vendas_estornos (vendedor_id, mes_origem, valor, motivo)
      values (p_vendedor, p_mes, -saldo, 'saldo_negativo');
      insert into public.vendas_alteracoes (por, via, tipo, mes, vendedor_id, depois)
      values ((select auth.uid()), 'admin', 'estorno_criado', p_mes, p_vendedor,
              jsonb_build_object('valor', -saldo, 'motivo', 'saldo_negativo'));
    elsif e.valor <> -saldo then
      update public.vendas_estornos set valor = -saldo where id = e.id;
      insert into public.vendas_alteracoes (por, via, tipo, mes, vendedor_id, antes, depois)
      values ((select auth.uid()), 'admin', 'estorno_criado', p_mes, p_vendedor,
              jsonb_build_object('valor', e.valor), jsonb_build_object('valor', -saldo, 'motivo', 'saldo_negativo'));
    end if;
  elsif found then
    update public.vendas_estornos set cancelado_em = now() where id = e.id;
    insert into public.vendas_alteracoes (por, via, tipo, mes, vendedor_id, depois)
    values ((select auth.uid()), 'admin', 'estorno_cancelado', p_mes, p_vendedor,
            jsonb_build_object('estorno_id', e.id, 'valor', e.valor, 'motivo', 'saldo_negativo'));
  end if;
end;
$$;

revoke execute on function privado.vendas_recalcula_saldo(date, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ajuste: além do que já valia (só em mês fechado, registrado), não deixa lançar ajuste
-- num mês cujo saldo negativo já foi descontado no mês seguinte (não teria efeito).
-- ---------------------------------------------------------------------------
create or replace function privado.vendas_ajuste_registra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  descontado date;
begin
  if not exists (select 1 from public.vendas_fechamentos where mes = new.mes and vendedor_id = new.vendedor_id) then
    raise exception 'Ajuste só em mês fechado. Mês aberto: corrija a venda direto.';
  end if;
  select descontado_no_mes into descontado from public.vendas_estornos
   where vendedor_id = new.vendedor_id and mes_origem = new.mes
     and motivo = 'saldo_negativo' and cancelado_em is null and descontado_no_mes is not null;
  if descontado is not null then
    raise exception 'O saldo negativo deste mês já foi descontado em %. Lance o ajuste no mês seguinte.',
      to_char(descontado, 'MM/YYYY');
  end if;
  insert into public.vendas_alteracoes (por, via, tipo, mes, vendedor_id, motivo, depois)
  values (new.criado_por, 'admin', 'ajuste_criado', new.mes, new.vendedor_id, new.motivo,
          jsonb_build_object('ajuste_id', new.id, 'valor', new.valor));
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos que disparam o recálculo
-- ---------------------------------------------------------------------------
create or replace function privado.vendas_saldo_ao_mudar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform privado.vendas_recalcula_saldo(new.mes, new.vendedor_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or (old.mes, old.vendedor_id) is distinct from (new.mes, new.vendedor_id)) then
    perform privado.vendas_recalcula_saldo(old.mes, old.vendedor_id);
  end if;
  return null;
end;
$$;

revoke execute on function privado.vendas_saldo_ao_mudar() from public, anon, authenticated;

-- ao fechar (depois do gatilho que desconta os estornos e grava o total em "estornos")
create trigger vendas_saldo_ao_fechar
  after insert on public.vendas_fechamentos
  for each row execute function privado.vendas_saldo_ao_mudar();

create trigger vendas_saldo_ao_ajustar
  after insert on public.vendas_ajustes
  for each row execute function privado.vendas_saldo_ao_mudar();

create trigger vendas_saldo_ao_mudar_adiantamento
  after insert or update or delete on public.vendas_adiantamentos
  for each row execute function privado.vendas_saldo_ao_mudar();
