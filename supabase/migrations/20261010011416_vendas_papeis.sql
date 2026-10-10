-- Vendas: papel em Vendas separado do "admin do sistema" (decisões do Davi, 09/10/2026).
--
-- Papel em Vendas = app_metadata.vendas (o usuário não edita):
--   'chefe'    → vê e administra tudo em Vendas: todas as vendas, Geral completa, Configuração,
--                fechar/reabrir mês, ajustes, adiantamentos, metas, confirmar vendas pendentes.
--   'gerente'  → vendedor que vê a Geral completa (só números agregados) e confirma só as
--                próprias vendas pendentes. Lê só as próprias vendas. (Davi, depois que o
--                Rodrigo ativar a conta.)
--   'vendedor' → lê só as próprias vendas; Geral resumida (quantidade da equipe e % da meta).
-- Sem app_metadata.vendas: vale o papel do sistema (admin = chefe; os outros = vendedor). Assim
-- nada muda até alguém ganhar o papel de Vendas — hoje o Davi continua chefe.
--
-- "Admin do sistema" (app_metadata.papel = 'admin', privado.eh_admin) continua valendo para
-- Monitor, BMs, Usuários, Tarefas e Funil. Esta migration só troca as regras de VENDAS.
--
-- Gravar venda: continua só pelo servidor (o vendedor não tem permissão de gravar na tabela
-- vendas). O "Nova venda" do vendedor grava com vendedor = ele e aguardando_confirmacao = sim.

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------
create or replace function privado.vendas_papel()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif((select auth.jwt()) -> 'app_metadata' ->> 'vendas', ''),
    case when coalesce((select auth.jwt()) -> 'app_metadata' ->> 'papel', '') = 'admin' then 'chefe' else 'vendedor' end
  );
$$;

create or replace function privado.vendas_chefe()
returns boolean
language sql
stable
set search_path = ''
as $$
  select privado.vendas_papel() = 'chefe';
$$;

create or replace function privado.vendas_geral_completa()
returns boolean
language sql
stable
set search_path = ''
as $$
  select privado.vendas_papel() in ('chefe', 'gerente');
$$;

revoke execute on function privado.vendas_papel(), privado.vendas_chefe(), privado.vendas_geral_completa() from public, anon;
grant execute on function privado.vendas_papel(), privado.vendas_chefe(), privado.vendas_geral_completa() to authenticated;

-- ---------------------------------------------------------------------------
-- Regras (RLS) das tabelas de Vendas: onde era "é admin?", passa a ser "é chefe em Vendas?".
-- Troca feita política por política (a expressão continua igual, só muda a função).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  tabelas constant text[] := array[
    'vendedores', 'tickets', 'vendas', 'vendas_clientes', 'vendas_atribuicoes', 'hubla_eventos',
    'custos_fixos', 'custos_fixos_valores', 'vendas_meses', 'vendas_fechamentos',
    'vendas_adiantamentos', 'vendas_meses_vendedor', 'vendas_config', 'plataformas',
    'vendas_alteracoes', 'vendas_estornos', 'vendas_ajustes'];
begin
  for r in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and tablename = any (tabelas)
       and (coalesce(qual, '') like '%eh_admin%' or coalesce(with_check, '') like '%eh_admin%')
  loop
    execute format(
      'alter policy %I on public.%I %s %s',
      r.policyname, r.tablename,
      case when r.qual is not null then format('using (%s)', replace(r.qual, 'eh_admin', 'vendas_chefe')) else '' end,
      case when r.with_check is not null then format('with check (%s)', replace(r.with_check, 'eh_admin', 'vendas_chefe')) else '' end
    );
  end loop;

  -- conferência: nenhuma regra de Vendas pode continuar dependendo do admin do sistema
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = any (tabelas)
       and (coalesce(qual, '') like '%eh_admin%' or coalesce(with_check, '') like '%eh_admin%')
  ) then
    raise exception 'sobrou regra de Vendas usando eh_admin';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reabrir mês: só o chefe em Vendas
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
  if not (select privado.vendas_chefe()) then
    raise exception 'Só o chefe de Vendas reabre um mês.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 5 then
    raise exception 'Informe o motivo para reabrir (mínimo 5 letras).';
  end if;

  select * into f from public.vendas_fechamentos where mes = p_mes and vendedor_id = p_vendedor;
  if not found then
    raise exception 'Esse mês não está fechado.';
  end if;

  update public.vendas_estornos
     set cancelado_em = now()
   where vendedor_id = p_vendedor and mes_origem = p_mes
     and descontado_no_mes is null and cancelado_em is null;

  update public.vendas_estornos
     set descontado_no_mes = null
   where vendedor_id = p_vendedor and descontado_no_mes = p_mes;

  insert into public.vendas_alteracoes (por, via, tipo, mes, vendedor_id, motivo, antes)
  values ((select auth.uid()), 'admin', 'mes_reaberto', p_mes, p_vendedor, trim(p_motivo), to_jsonb(f));

  delete from public.vendas_fechamentos where mes = p_mes and vendedor_id = p_vendedor;
end;
$$;

-- ---------------------------------------------------------------------------
-- Venda cadastrada pelo vendedor: fica pendente até o chefe (ou o gerente, se for dele) confirmar.
-- Pendente não conta em nada (quantidade, bruto, líquido, comissão, receita, Geral).
-- ---------------------------------------------------------------------------
alter table public.vendas
  add column aguardando_confirmacao boolean not null default false,
  add column confirmada_por uuid references auth.users (id) on delete set null,
  add column confirmada_em timestamptz;

create index vendas_aguardando_idx on public.vendas (vendedor_id) where aguardando_confirmacao;
create index vendas_confirmada_por_idx on public.vendas (confirmada_por);

-- ---------------------------------------------------------------------------
-- Meta do mês (quantidade de vendas da equipe). O chefe define; todo logado lê.
-- ---------------------------------------------------------------------------
create table public.vendas_metas (
  mes             date primary key check (extract(day from mes) = 1),
  meta_qtd        integer not null check (meta_qtd > 0),
  atualizado_por  uuid references auth.users (id) on delete set null default auth.uid(),
  atualizado_em   timestamptz not null default now()
);

create index vendas_metas_atualizado_por_idx on public.vendas_metas (atualizado_por);

alter table public.vendas_metas enable row level security;
revoke all on public.vendas_metas from anon;
grant select, insert, update on public.vendas_metas to authenticated;
create policy "logado le metas" on public.vendas_metas for select to authenticated using (true);
create policy "chefe cria meta" on public.vendas_metas for insert to authenticated with check ((select privado.vendas_chefe()));
create policy "chefe edita meta" on public.vendas_metas for update to authenticated
  using ((select privado.vendas_chefe())) with check ((select privado.vendas_chefe()));

-- ---------------------------------------------------------------------------
-- Geral completa (chefe e gerente): SÓ números agregados por vendedor, nunca uma venda.
-- Mesmas contas da tela (resumirLI): pagas = todas as pagas; bruto/líquido/comissões = só as
-- com ticket; receita = pagas que não são teste. Pendentes e testes ficam fora.
-- ---------------------------------------------------------------------------
create or replace function public.vendas_geral_completa(p_inicio date, p_fim date)
returns table (
  vendedor_id bigint, pagas integer, reembolsos integer, chargebacks integer,
  bruto numeric, liquido numeric,
  comissao_6 numeric, comissao_7 numeric, comissao_8 numeric, comissao_9 numeric, comissao_10 numeric,
  receita numeric, sem_receita integer
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
         (count(*) filter (where v.status = 'pago' and v.receita_liquida is null))::integer
    from public.vendas v
   where v.data >= p_inicio and v.data < p_fim
     and not v.teste and not v.aguardando_confirmacao
   group by v.vendedor_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Geral resumida (todo logado): quantidade de vendas pagas da equipe e a meta do mês.
-- Sem nenhum valor em reais (para ninguém descobrir o valor do outro pela diferença).
-- ---------------------------------------------------------------------------
create or replace function public.vendas_geral_equipe(p_inicio date, p_fim date)
returns table (pagas integer, meta_qtd integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::integer from public.vendas v
           where v.data >= p_inicio and v.data < p_fim and v.status = 'pago'
             and not v.teste and not v.aguardando_confirmacao),
         (select m.meta_qtd from public.vendas_metas m where m.mes = date_trunc('month', p_inicio)::date);
$$;

revoke execute on function public.vendas_geral_completa(date, date), public.vendas_geral_equipe(date, date) from public, anon;
grant execute on function public.vendas_geral_completa(date, date), public.vendas_geral_equipe(date, date) to authenticated;
