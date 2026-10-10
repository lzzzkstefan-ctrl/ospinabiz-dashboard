-- Vendas: registro de alterações COMPLETO (pedido do Davi, 10/10/2026, ao virar chefe junto com o
-- Rodrigo). Antes, vendas_alteracoes só registrava mudança em venda de MÊS FECHADO; agora:
--   1. qualquer pessoa que cria, altera ou apaga uma venda, em qualquer mês, fica registrada (quem,
--      quando, antes, depois). O webhook da Hubla em mês aberto continua sem registro (não é pessoa
--      e mexe muito; em mês fechado segue registrado como antes);
--   2. fechar mês entra no registro (antes ficava só fechado_por no próprio fechamento);
--   3. reabrir mês, ajuste e estorno continuam registrados como já eram.
-- Quem lê: só o chefe (regra já existente "admin le alteracoes", que virou vendas_chefe()).
-- Ninguém edita nem apaga o registro.

alter table public.vendas_alteracoes drop constraint vendas_alteracoes_tipo_check;
alter table public.vendas_alteracoes add constraint vendas_alteracoes_tipo_check check (tipo in (
  'venda_criada', 'venda_alterada', 'venda_apagada', 'mes_fechado', 'mes_reaberto',
  'ajuste_criado', 'estorno_criado', 'estorno_cancelado'));
-- venda "a atribuir" (sem vendedor) também pode ser criada/alterada por alguém
alter table public.vendas_alteracoes alter column vendedor_id drop not null;

create or replace function privado.vendas_trava_mes_fechado()
returns trigger
language plpgsql
security definer  -- grava no registro/estornos, que nem a chave secreta edita
set search_path = ''
as $$
declare
  ignorar constant text[] := array['atualizado_em', 'alterado_por', 'alterado_via'];
  por_    uuid;
  via_    text;
  pessoa_ uuid;
  travado_antes  boolean := false;
  travado_depois boolean := false;
  antes_  jsonb;
  depois_ jsonb;
  f       record;
  valor_  numeric;
begin
  if tg_op = 'DELETE' then
    if privado.vendas_mes_fechado(old.data, old.vendedor_id) then
      raise exception 'Venda de mês fechado não pode ser apagada. Reabra o mês antes.';
    end if;
    -- mês aberto: quem apagou fica registrado (com a venda inteira em "antes")
    if (select auth.uid()) is not null then
      insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, antes)
      values ((select auth.uid()), 'admin', 'venda_apagada', null, date_trunc('month', old.data)::date, old.vendedor_id, to_jsonb(old) - ignorar);
    end if;
    return old;
  end if;

  -- quem está mudando: lê e limpa (não fica gravado na venda; vai para o registro)
  por_ := new.alterado_por;
  via_ := new.alterado_via;
  new.alterado_por := null;
  new.alterado_via := null;
  -- pessoa: a que a tela informou ou a do login (a tela com o login da pessoa não precisa informar)
  pessoa_ := coalesce(por_, (select auth.uid()));

  if tg_op = 'UPDATE' then
    travado_antes := privado.vendas_mes_fechado(old.data, old.vendedor_id);
  end if;
  travado_depois := privado.vendas_mes_fechado(new.data, new.vendedor_id);

  -- o que mudou (sem as colunas de controle)
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(a.key, a.value), jsonb_object_agg(a.key, d.value)
      into antes_, depois_
      from jsonb_each(to_jsonb(old)) a
      join jsonb_each(to_jsonb(new)) d using (key)
     where a.value is distinct from d.value
       and not (a.key = any (ignorar));
    if antes_ is null then
      return new;  -- nada mudou de verdade
    end if;
  else
    depois_ := to_jsonb(new) - ignorar;
  end if;

  -- MÊS ABERTO: registra se foi uma pessoa (não o webhook da Hubla) e segue
  if not (travado_antes or travado_depois) then
    if pessoa_ is not null and via_ is distinct from 'hubla' then
      insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, antes, depois)
      values (
        pessoa_, 'admin',
        case when tg_op = 'INSERT' then 'venda_criada' else 'venda_alterada' end,
        new.id,
        date_trunc('month', new.data)::date,
        coalesce(new.vendedor_id, case when tg_op = 'UPDATE' then old.vendedor_id end),
        antes_, depois_
      );
    end if;
    return new;
  end if;

  -- MÊS FECHADO (como antes)
  if via_ is null or (via_ = 'admin' and por_ is null) then
    raise exception 'Mês fechado: só o admin altera (alteração sem identificação de quem mudou).';
  end if;
  if via_ = 'hubla' and tg_op = 'UPDATE'
     and exists (select 1 from jsonb_object_keys(antes_) k
                 where k not in ('status', 'reembolsado_em')) then
    raise exception 'Mês fechado: o webhook da Hubla só pode mudar o status (reembolso).';
  end if;

  insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, antes, depois)
  values (
    por_, via_,
    case when tg_op = 'INSERT' then 'venda_criada' else 'venda_alterada' end,
    new.id,
    date_trunc('month', case when travado_antes then old.data else new.data end)::date,
    case when travado_antes then old.vendedor_id else new.vendedor_id end,
    antes_, depois_
  );

  -- estorno: venda paga de mês fechado virou reembolso/chargeback
  if tg_op = 'UPDATE' and travado_antes
     and old.status = 'pago' and new.status in ('reembolso', 'chargeback') then
    select * into f from public.vendas_fechamentos
     where mes = date_trunc('month', old.data)::date and vendedor_id = old.vendedor_id;
    valor_ := case f.faixa
                when 6 then old.snap_comissao_6  when 7 then old.snap_comissao_7
                when 8 then old.snap_comissao_8  when 9 then old.snap_comissao_9
                when 10 then old.snap_comissao_10 end;
    if coalesce(valor_, 0) > 0 then
      insert into public.vendas_estornos (venda_id, vendedor_id, mes_origem, faixa, valor, motivo)
      values (old.id, old.vendedor_id, f.mes, f.faixa, valor_, new.status);
      insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, depois)
      values (por_, via_, 'estorno_criado', old.id, f.mes, old.vendedor_id,
              jsonb_build_object('valor', valor_, 'faixa', f.faixa, 'motivo', new.status));
    end if;
  end if;

  -- voltou para pago antes do desconto: cancela o estorno pendente
  if tg_op = 'UPDATE' and old.status in ('reembolso', 'chargeback') and new.status = 'pago' then
    with cancelados as (
      update public.vendas_estornos
         set cancelado_em = now()
       where venda_id = old.id and descontado_no_mes is null and cancelado_em is null
      returning id, valor, mes_origem, vendedor_id
    )
    insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, depois)
    select por_, via_, 'estorno_cancelado', old.id, c.mes_origem, c.vendedor_id,
           jsonb_build_object('estorno_id', c.id, 'valor', c.valor)
      from cancelados c;
  end if;

  return new;
end;
$$;

-- fechar mês entra no registro (quem fechou, faixa e números congelados)
create or replace function privado.vendas_fechamento_registra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vendas_alteracoes (por, via, tipo, mes, vendedor_id, depois)
  values (coalesce(new.fechado_por, (select auth.uid())), 'admin', 'mes_fechado', new.mes, new.vendedor_id,
          jsonb_build_object('faixa', new.faixa, 'faixa_sugerida', new.faixa_sugerida, 'qtd', new.qtd,
                             'bruto', new.bruto, 'liquido', new.liquido, 'comissao', new.comissao));
  return new;
end;
$$;

revoke execute on function privado.vendas_fechamento_registra() from public, anon, authenticated;

create trigger vendas_fechamento_registra
  after insert on public.vendas_fechamentos
  for each row execute function privado.vendas_fechamento_registra();
