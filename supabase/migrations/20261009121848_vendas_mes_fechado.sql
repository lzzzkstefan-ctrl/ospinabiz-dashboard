-- Vendas: mês fechado fica travado. Regras em docs/modulos/vendas.md ("Mês fechado").
--
-- 1. Trava: venda de um mês já fechado para aquele vendedor (linha em vendas_fechamentos)
--    só muda se a alteração disser quem está mudando:
--      vendas.alterado_via = 'admin' + vendas.alterado_por = id do admin  (telas de Vendas)
--      vendas.alterado_via = 'hubla'                                       (webhook: só status/reembolso)
--    Vale também para MOVER uma venda para dentro de um mês fechado (ex.: atribuir ao Davi
--    uma venda de julho). As duas colunas são "de passagem": o gatilho lê, registra e apaga.
--    Apagar venda de mês fechado: nunca (reabra o mês antes).
-- 2. Registro: vendas_alteracoes guarda quem, quando, o quê (antes/depois). Só admin lê;
--    ninguém edita nem apaga (nem a chave secreta).
-- 3. Estorno: venda paga de mês fechado que vira reembolso/chargeback gera um estorno com a
--    comissão dela (na faixa do fechamento). O estorno é descontado sozinho no PRÓXIMO
--    fechamento do vendedor, guardando a venda e o mês de origem. Se o status voltar para
--    pago antes do desconto, o estorno é cancelado.
-- 4. Fechamento: não se edita mais (fechar de novo exige reabrir). Reabrir só pelo admin, com
--    motivo obrigatório (função public.vendas_reabrir_mes). Ao reabrir: os estornos que
--    nasceram desse mês e ainda não foram descontados são cancelados (o recálculo do mês já
--    pega o reembolso); os estornos descontados NESSE fechamento voltam a ficar pendentes.
-- 5. Ajuste manual: valor (+ ou −) e motivo, só admin, em mês fechado, sem reabrir.
--    Não se edita nem apaga: corrige-se com outro ajuste.

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------
create or replace function privado.vendas_mes_fechado(p_data date, p_vendedor bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_vendedor is not null and exists (
    select 1 from public.vendas_fechamentos f
    where f.mes = date_trunc('month', p_data)::date and f.vendedor_id = p_vendedor
  );
$$;

revoke execute on function privado.vendas_mes_fechado(date, bigint) from public, anon;
grant execute on function privado.vendas_mes_fechado(date, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- vendas_alteracoes: o registro (append-only)
-- ---------------------------------------------------------------------------
create table public.vendas_alteracoes (
  id           bigint generated always as identity primary key,
  em           timestamptz not null default now(),
  por          uuid references auth.users (id) on delete set null,
  via          text not null check (via in ('admin', 'hubla')),
  tipo         text not null check (tipo in (
                 'venda_criada', 'venda_alterada', 'mes_reaberto',
                 'ajuste_criado', 'estorno_criado', 'estorno_cancelado')),
  -- conferida no fim da transação: na venda criada, o registro nasce antes da própria venda
  venda_id     bigint references public.vendas (id) on delete set null deferrable initially deferred,
  mes          date not null check (extract(day from mes) = 1),
  vendedor_id  bigint not null references public.equipe (id),
  motivo       text,
  antes        jsonb,
  depois       jsonb
);

create index vendas_alteracoes_venda_id_idx on public.vendas_alteracoes (venda_id);
create index vendas_alteracoes_mes_vendedor_idx on public.vendas_alteracoes (mes, vendedor_id);
create index vendas_alteracoes_vendedor_id_idx on public.vendas_alteracoes (vendedor_id);
create index vendas_alteracoes_por_idx on public.vendas_alteracoes (por);

-- ---------------------------------------------------------------------------
-- vendas_estornos: comissão a descontar no próximo fechamento
-- ---------------------------------------------------------------------------
create table public.vendas_estornos (
  id                  bigint generated always as identity primary key,
  venda_id            bigint not null references public.vendas (id),
  vendedor_id         bigint not null references public.equipe (id),
  mes_origem          date not null check (extract(day from mes_origem) = 1),
  faixa               integer not null check (faixa in (6, 7, 8, 9, 10)),
  valor               numeric(12, 2) not null check (valor > 0),
  motivo              text not null check (motivo in ('reembolso', 'chargeback')),
  criado_em           timestamptz not null default now(),
  descontado_no_mes   date check (descontado_no_mes is null or extract(day from descontado_no_mes) = 1),
  cancelado_em        timestamptz,
  constraint vendas_estornos_desconto_depois check (descontado_no_mes is null or descontado_no_mes > mes_origem),
  constraint vendas_estornos_cancelado_ou_descontado check (not (cancelado_em is not null and descontado_no_mes is not null))
);

create index vendas_estornos_venda_id_idx on public.vendas_estornos (venda_id);
create index vendas_estornos_pendentes_idx on public.vendas_estornos (vendedor_id, mes_origem)
  where descontado_no_mes is null and cancelado_em is null;
create index vendas_estornos_descontado_idx on public.vendas_estornos (vendedor_id, descontado_no_mes);

-- ---------------------------------------------------------------------------
-- vendas_ajustes: correção manual no fechamento, sem reabrir
-- ---------------------------------------------------------------------------
create table public.vendas_ajustes (
  id           bigint generated always as identity primary key,
  mes          date not null check (extract(day from mes) = 1),
  vendedor_id  bigint not null references public.equipe (id),
  valor        numeric(12, 2) not null check (valor <> 0),   -- + paga a mais, − desconta
  motivo       text not null check (length(trim(motivo)) between 5 and 500),
  criado_por   uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em    timestamptz not null default now()
);

create index vendas_ajustes_mes_vendedor_idx on public.vendas_ajustes (mes, vendedor_id);
create index vendas_ajustes_vendedor_id_idx on public.vendas_ajustes (vendedor_id);
create index vendas_ajustes_criado_por_idx on public.vendas_ajustes (criado_por);

-- ---------------------------------------------------------------------------
-- vendas: colunas de passagem (quem está mudando) e total de estornos no fechamento
-- ---------------------------------------------------------------------------
alter table public.vendas
  add column alterado_por uuid,
  add column alterado_via text check (alterado_via in ('admin', 'hubla'));

alter table public.vendas_fechamentos
  add column estornos numeric(12, 2) not null default 0 check (estornos >= 0);

-- ---------------------------------------------------------------------------
-- Gatilho da trava (vendas). Roda depois de vendas_snapshot_ticket (ordem alfabética).
-- ---------------------------------------------------------------------------
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
    return old;
  end if;

  -- quem está mudando: lê e limpa (não fica gravado na venda; vai para o registro)
  por_ := new.alterado_por;
  via_ := new.alterado_via;
  new.alterado_por := null;
  new.alterado_via := null;

  if tg_op = 'UPDATE' then
    travado_antes := privado.vendas_mes_fechado(old.data, old.vendedor_id);
  end if;
  travado_depois := privado.vendas_mes_fechado(new.data, new.vendedor_id);
  if not (travado_antes or travado_depois) then
    return new;
  end if;

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

revoke execute on function privado.vendas_trava_mes_fechado() from public, anon, authenticated;

create trigger vendas_trava_mes_fechado
  before insert or update or delete on public.vendas
  for each row execute function privado.vendas_trava_mes_fechado();

-- ---------------------------------------------------------------------------
-- Gatilho do fechamento: ao fechar, desconta os estornos pendentes de meses anteriores.
-- ---------------------------------------------------------------------------
create or replace function privado.vendas_fechamento_desconta_estornos()
returns trigger
language plpgsql
security definer  -- grava no registro/estornos, que nem a chave secreta edita
set search_path = ''
as $$
begin
  with descontados as (
    update public.vendas_estornos
       set descontado_no_mes = new.mes
     where vendedor_id = new.vendedor_id
       and mes_origem < new.mes
       and descontado_no_mes is null
       and cancelado_em is null
    returning valor
  )
  select coalesce(sum(valor), 0) into new.estornos from descontados;
  return new;
end;
$$;

revoke execute on function privado.vendas_fechamento_desconta_estornos() from public, anon, authenticated;

create trigger vendas_fechamento_desconta_estornos
  before insert on public.vendas_fechamentos
  for each row execute function privado.vendas_fechamento_desconta_estornos();

-- Fechamento não se edita: fechar de novo exige reabrir (com motivo).
drop policy "admin edita fechamento" on public.vendas_fechamentos;
revoke update, delete on public.vendas_fechamentos from authenticated;

-- ---------------------------------------------------------------------------
-- Reabrir mês: só admin, motivo obrigatório. Chamada pela tela com o login do admin
-- (supabase.rpc('vendas_reabrir_mes', ...)), por isso sabe quem reabriu.
-- ---------------------------------------------------------------------------
create or replace function public.vendas_reabrir_mes(p_mes date, p_vendedor bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
begin
  if not (select privado.eh_admin()) then
    raise exception 'Só o admin reabre um mês.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 5 then
    raise exception 'Informe o motivo para reabrir (mínimo 5 letras).';
  end if;

  select * into f from public.vendas_fechamentos where mes = p_mes and vendedor_id = p_vendedor;
  if not found then
    raise exception 'Esse mês não está fechado.';
  end if;

  -- estornos nascidos neste mês e ainda não descontados: o recálculo do mês já pega o reembolso
  update public.vendas_estornos
     set cancelado_em = now()
   where vendedor_id = p_vendedor and mes_origem = p_mes
     and descontado_no_mes is null and cancelado_em is null;

  -- estornos descontados NESTE fechamento voltam a ficar pendentes
  update public.vendas_estornos
     set descontado_no_mes = null
   where vendedor_id = p_vendedor and descontado_no_mes = p_mes;

  insert into public.vendas_alteracoes (por, via, tipo, mes, vendedor_id, motivo, antes)
  values ((select auth.uid()), 'admin', 'mes_reaberto', p_mes, p_vendedor, trim(p_motivo), to_jsonb(f));

  delete from public.vendas_fechamentos where mes = p_mes and vendedor_id = p_vendedor;
end;
$$;

revoke execute on function public.vendas_reabrir_mes(date, bigint, text) from public, anon;
grant execute on function public.vendas_reabrir_mes(date, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ajuste manual: só em mês fechado; registrado.
-- ---------------------------------------------------------------------------
create or replace function privado.vendas_ajuste_registra()
returns trigger
language plpgsql
security definer  -- grava no registro/estornos, que nem a chave secreta edita
set search_path = ''
as $$
begin
  if not exists (select 1 from public.vendas_fechamentos where mes = new.mes and vendedor_id = new.vendedor_id) then
    raise exception 'Ajuste só em mês fechado. Mês aberto: corrija a venda direto.';
  end if;
  insert into public.vendas_alteracoes (por, via, tipo, mes, vendedor_id, motivo, depois)
  values (new.criado_por, 'admin', 'ajuste_criado', new.mes, new.vendedor_id, new.motivo,
          jsonb_build_object('ajuste_id', new.id, 'valor', new.valor));
  return new;
end;
$$;

revoke execute on function privado.vendas_ajuste_registra() from public, anon, authenticated;

create trigger vendas_ajuste_registra
  after insert on public.vendas_ajustes
  for each row execute function privado.vendas_ajuste_registra();

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------
alter table public.vendas_alteracoes enable row level security;
alter table public.vendas_estornos   enable row level security;
alter table public.vendas_ajustes    enable row level security;

revoke all on public.vendas_alteracoes, public.vendas_estornos, public.vendas_ajustes from anon;
-- registro: ninguém altera nem apaga, nem a chave secreta (só os gatilhos inserem)
revoke insert, update, delete, truncate on public.vendas_alteracoes from authenticated, service_role;
revoke update, delete, truncate on public.vendas_ajustes from authenticated, service_role;
revoke insert, update, delete, truncate on public.vendas_estornos from authenticated;

grant select on public.vendas_alteracoes, public.vendas_estornos, public.vendas_ajustes to authenticated;
grant insert on public.vendas_ajustes to authenticated;

create policy "admin le alteracoes" on public.vendas_alteracoes
  for select to authenticated using ((select privado.eh_admin()));

-- estornos e ajustes mexem no que o vendedor recebe: ele vê os dele
create policy "le estornos: admin tudo, vendedor os proprios" on public.vendas_estornos
  for select to authenticated
  using ((select privado.eh_admin()) or vendedor_id = (select privado.minha_equipe_id()));

create policy "le ajustes: admin tudo, vendedor os proprios" on public.vendas_ajustes
  for select to authenticated
  using ((select privado.eh_admin()) or vendedor_id = (select privado.minha_equipe_id()));
create policy "admin cria ajuste" on public.vendas_ajustes
  for insert to authenticated with check ((select privado.eh_admin()) and criado_por = (select auth.uid()));
