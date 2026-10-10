-- Escala e check-in, fase 1 (plano aprovado pelo Davi em 10/10/2026).
--
-- 1. Papel "plantonista" (app_metadata.papel): só cobre turnos. Vê a escala, faz check-in, vê os
--    leads dele no Funil e as tarefas dele. NÃO vê Vendas (nem a Geral), comissão, Webinários nem
--    Monitor. O bloqueio é aqui no banco, não só no menu.
-- 2. escala_padrao: quem cobre cada dia da semana, horário e tipo (normal / raspagem). Guarda
--    histórico (desde / ate): mudar a escala não reescreve o "escalado" dos dias que já passaram.
-- 3. escala_plantoes: "vou ficar no sábado 17/10". Nasce pendente; o admin confirma ou recusa.
--    A pessoa cancela o próprio enquanto pendente (função escala_cancelar_plantao).
-- 4. escala_checkins: começar / encerrar turno pelo horário do SERVIDOR (funções, ninguém digita a
--    hora). Turno esquecido aberto fecha sozinho no fim do atendimento (pg_cron, 22h05). Correção
--    só pelo admin, com motivo, registrada em escala_checkins_alteracoes (só acrescenta).
-- Dias da semana: 0 = domingo ... 6 = sábado. Horários no fuso de Brasília.

-- ---------------------------------------------------------------------------
-- 1. Papel plantonista
-- ---------------------------------------------------------------------------
create or replace function privado.eh_plantonista()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'papel', '') = 'plantonista';
$$;

revoke execute on function privado.eh_plantonista() from public, anon;
grant execute on function privado.eh_plantonista() to authenticated;

-- Vendas: plantonista não tem papel nenhum (antes, quem não tinha papel em Vendas virava "vendedor")
create or replace function privado.vendas_papel()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce((select auth.jwt()) -> 'app_metadata' ->> 'papel', '') = 'plantonista' then 'nenhum'
    else coalesce(
      nullif((select auth.jwt()) -> 'app_metadata' ->> 'vendas', ''),
      case when coalesce((select auth.jwt()) -> 'app_metadata' ->> 'papel', '') = 'admin' then 'chefe' else 'vendedor' end
    )
  end;
$$;

-- Geral da equipe (quantidade e meta): nada para o plantonista
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
         (select m.meta_qtd from public.vendas_metas m where m.mes = date_trunc('month', p_inicio)::date)
   where not (select privado.eh_plantonista());
$$;

-- Webinários no ar (nome e playbook): nada para o plantonista
create or replace function public.webinarios_no_ar()
returns table (webinario_id bigint, nome text, playbook_titulo text, playbook_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.nome, l.titulo, l.url
    from public.webinarios w
    left join public.webinario_links l on l.webinario_id = w.id and l.tipo = 'playbook'
   where w.status = 'no_ar'
     and not (select privado.eh_plantonista())
   order by w.nome, l.titulo;
$$;

-- Tabelas que qualquer logado lia: o plantonista deixa de ler.
--   tickets (preço e comissão por ticket), vendedores, vendas_metas (meta do mês),
--   monitor_* (BMs e números monitorados, com telefone).
-- As regras "qualquer logado lê" (using true) são achadas pelo que fazem, não pelo nome, e trocadas.
-- Tarefas: o plantonista vê e edita só as dele (os outros continuam vendo todas).
do $$
declare
  r record;
  t text;
  tabelas constant text[] := array['tickets', 'vendedores', 'vendas_metas', 'monitor_bms', 'monitor_numeros', 'monitor_testes', 'monitor_resultados'];
begin
  for r in
    select tablename, policyname, cmd
      from pg_policies
     where schemaname = 'public'
       and ((tablename = any (tabelas) and cmd = 'SELECT')
            or (tablename = 'tarefas' and cmd in ('SELECT', 'UPDATE')))
       and coalesce(qual, '') = 'true'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  foreach t in array tabelas loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (not (select privado.eh_plantonista()))',
      'logado le, menos plantonista', t);
  end loop;

  -- conferência: não pode sobrar regra "qualquer logado lê" nessas tabelas
  if exists (select 1 from pg_policies
              where schemaname = 'public'
                and ((tablename = any (tabelas) and cmd = 'SELECT') or (tablename = 'tarefas' and cmd in ('SELECT', 'UPDATE')))
                and coalesce(qual, '') = 'true') then
    raise exception 'Sobrou regra que deixa qualquer logado ler; nada foi aplicado.';
  end if;
end;
$$;

create policy "le tarefas: todas, plantonista as proprias" on public.tarefas
  for select to authenticated
  using (not (select privado.eh_plantonista()) or responsavel_id = (select privado.minha_equipe_id()));
create policy "edita tarefas: todas, plantonista as proprias" on public.tarefas
  for update to authenticated
  using (not (select privado.eh_plantonista()) or responsavel_id = (select privado.minha_equipe_id()))
  with check (not (select privado.eh_plantonista()) or responsavel_id = (select privado.minha_equipe_id()));

-- ---------------------------------------------------------------------------
-- 2. Escala padrão (por dia da semana, com histórico)
-- ---------------------------------------------------------------------------
create table public.escala_padrao (
  id          bigint generated always as identity primary key,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  equipe_id   bigint not null references public.equipe (id),
  inicio      time not null default '09:00',
  fim         time not null default '22:00',
  tipo        text not null default 'normal' check (tipo in ('normal', 'raspagem')),
  -- vale de `desde` até `ate` (inclusive); ate vazio = vale até mudar
  desde       date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  ate         date,
  criado_por  uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now(),
  constraint escala_padrao_horario check (fim > inicio),
  constraint escala_padrao_vigencia check (ate is null or ate >= desde)
);

create index escala_padrao_dia_idx on public.escala_padrao (dia_semana);
create index escala_padrao_equipe_id_idx on public.escala_padrao (equipe_id);
create index escala_padrao_criado_por_idx on public.escala_padrao (criado_por);

-- ---------------------------------------------------------------------------
-- 3. Plantões extras
-- ---------------------------------------------------------------------------
create table public.escala_plantoes (
  id            bigint generated always as identity primary key,
  dia           date not null,
  equipe_id     bigint not null references public.equipe (id),
  inicio        time not null default '09:00',
  fim           time not null default '22:00',
  tipo          text not null default 'normal' check (tipo in ('normal', 'raspagem')),
  situacao      text not null default 'pendente' check (situacao in ('pendente', 'confirmado', 'recusado', 'cancelado')),
  motivo        text check (motivo is null or length(motivo) <= 300),
  pedido_por    uuid references auth.users (id) on delete set null default auth.uid(),
  pedido_em     timestamptz not null default now(),
  decidido_por  uuid references auth.users (id) on delete set null,
  decidido_em   timestamptz,
  constraint escala_plantoes_horario check (fim > inicio)
);

create index escala_plantoes_dia_idx on public.escala_plantoes (dia);
create index escala_plantoes_equipe_id_idx on public.escala_plantoes (equipe_id);
create index escala_plantoes_pedido_por_idx on public.escala_plantoes (pedido_por);
create index escala_plantoes_decidido_por_idx on public.escala_plantoes (decidido_por);

-- quem decidiu e quando: preenchido sozinho quando a situação muda
create or replace function privado.escala_plantao_decisao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.situacao is distinct from old.situacao then
    new.decidido_por := auth.uid();
    new.decidido_em := now();
  end if;
  return new;
end;
$$;

create trigger escala_plantao_decisao
  before update on public.escala_plantoes
  for each row execute function privado.escala_plantao_decisao();

-- a pessoa cancela o próprio plantão enquanto ele está pendente
create or replace function public.escala_cancelar_plantao(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.escala_plantoes
     set situacao = 'cancelado'
   where id = p_id
     and situacao = 'pendente'
     and equipe_id = (select privado.minha_equipe_id());
  if not found then
    raise exception 'Plantão não encontrado ou não está mais pendente.';
  end if;
end;
$$;

revoke execute on function public.escala_cancelar_plantao(bigint) from public, anon;
grant execute on function public.escala_cancelar_plantao(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Check-in
-- ---------------------------------------------------------------------------
create table public.escala_checkins (
  id              bigint generated always as identity primary key,
  equipe_id       bigint not null references public.equipe (id),
  tipo            text not null default 'normal' check (tipo in ('normal', 'raspagem')),
  inicio          timestamptz not null default now(),
  fim             timestamptz,
  encerrado_auto  boolean not null default false,
  -- preenchido pelo admin ao corrigir; vai para escala_checkins_alteracoes
  motivo_correcao text check (motivo_correcao is null or length(motivo_correcao) <= 300),
  constraint escala_checkins_horario check (fim is null or fim >= inicio)
);

-- um turno aberto por pessoa
create unique index escala_checkins_um_aberto on public.escala_checkins (equipe_id) where fim is null;
create index escala_checkins_inicio_idx on public.escala_checkins (inicio);

create table public.escala_checkins_alteracoes (
  id            bigint generated always as identity primary key,
  checkin_id    bigint not null references public.escala_checkins (id) deferrable initially deferred,
  inicio_antes  timestamptz,
  fim_antes     timestamptz,
  inicio_depois timestamptz,
  fim_depois    timestamptz,
  motivo        text not null,
  alterado_por  uuid references auth.users (id) on delete set null,
  alterado_em   timestamptz not null default now()
);

create index escala_checkins_alteracoes_checkin_id_idx on public.escala_checkins_alteracoes (checkin_id);
create index escala_checkins_alteracoes_alterado_por_idx on public.escala_checkins_alteracoes (alterado_por);

-- correção do admin: exige motivo e registra antes/depois
create or replace function privado.escala_checkin_registra_correcao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.inicio is distinct from old.inicio or new.fim is distinct from old.fim)
     and coalesce(current_setting('escala.sistema', true), '') <> 'sim' then
    if coalesce(btrim(new.motivo_correcao), '') = '' then
      raise exception 'Corrigir um turno exige motivo.';
    end if;
    insert into public.escala_checkins_alteracoes (checkin_id, inicio_antes, fim_antes, inicio_depois, fim_depois, motivo, alterado_por)
    values (new.id, old.inicio, old.fim, new.inicio, new.fim, btrim(new.motivo_correcao), auth.uid());
  end if;
  new.motivo_correcao := null;
  return new;
end;
$$;

create trigger escala_checkin_registra_correcao
  before update on public.escala_checkins
  for each row execute function privado.escala_checkin_registra_correcao();

-- começar / encerrar turno: hora do servidor, sempre o próprio turno
create or replace function public.escala_comecar_turno(p_tipo text default 'normal')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu bigint := (select privado.minha_equipe_id());
  novo bigint;
begin
  if eu is null then
    raise exception 'Seu login não está ligado a ninguém da equipe.';
  end if;
  if exists (select 1 from public.escala_checkins where equipe_id = eu and fim is null) then
    raise exception 'Você já tem um turno aberto.';
  end if;
  insert into public.escala_checkins (equipe_id, tipo) values (eu, coalesce(p_tipo, 'normal')) returning id into novo;
  return novo;
end;
$$;

create or replace function public.escala_encerrar_turno()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('escala.sistema', 'sim', true);
  update public.escala_checkins set fim = now()
   where equipe_id = (select privado.minha_equipe_id()) and fim is null;
  if not found then
    raise exception 'Você não tem turno aberto.';
  end if;
end;
$$;

revoke execute on function public.escala_comecar_turno(text), public.escala_encerrar_turno() from public, anon;
grant execute on function public.escala_comecar_turno(text), public.escala_encerrar_turno() to authenticated;

-- turno esquecido: fecha no fim do atendimento do dia em que começou (funil_config.atendimento_fim)
create or replace function privado.escala_encerrar_esquecidos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  fim_dia time := coalesce((select atendimento_fim from public.funil_config where id), '22:00');
  n integer;
begin
  perform set_config('escala.sistema', 'sim', true);
  update public.escala_checkins c
     set fim = greatest(c.inicio, (((c.inicio at time zone 'America/Sao_Paulo')::date + fim_dia) at time zone 'America/Sao_Paulo')),
         encerrado_auto = true
   where c.fim is null
     and (((c.inicio at time zone 'America/Sao_Paulo')::date + fim_dia) at time zone 'America/Sao_Paulo') <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function privado.escala_encerrar_esquecidos() from public, anon, authenticated;

-- 22h05 em Brasília = 01h05 UTC
select cron.schedule('escala-encerrar-esquecidos', '5 1 * * *', $$select privado.escala_encerrar_esquecidos()$$);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.escala_padrao              enable row level security;
alter table public.escala_plantoes            enable row level security;
alter table public.escala_checkins            enable row level security;
alter table public.escala_checkins_alteracoes enable row level security;

revoke all on public.escala_padrao, public.escala_plantoes, public.escala_checkins, public.escala_checkins_alteracoes from anon, authenticated;
grant select on public.escala_padrao, public.escala_plantoes, public.escala_checkins, public.escala_checkins_alteracoes to authenticated;
grant insert (dia_semana, equipe_id, inicio, fim, tipo, desde) , update (ate), delete on public.escala_padrao to authenticated;
grant insert (dia, equipe_id, inicio, fim, tipo) , update (situacao, motivo) on public.escala_plantoes to authenticated;
grant update (inicio, fim, motivo_correcao) on public.escala_checkins to authenticated;

-- escala padrão: todos leem; só admin muda
create policy "logado le escala padrao" on public.escala_padrao for select to authenticated using (true);
create policy "admin cria escala padrao" on public.escala_padrao for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin encerra escala padrao" on public.escala_padrao for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
create policy "admin apaga escala padrao" on public.escala_padrao for delete to authenticated using ((select privado.eh_admin()));

-- plantões: todos leem; cada um pede o próprio (de hoje em diante, pendente); admin pede para
-- qualquer um e decide
create policy "logado le plantoes" on public.escala_plantoes for select to authenticated using (true);
create policy "pede plantao: o proprio, ou admin para qualquer um" on public.escala_plantoes
  for insert to authenticated
  with check (
    (select privado.eh_admin())
    or (equipe_id = (select privado.minha_equipe_id())
        and dia >= ((now() at time zone 'America/Sao_Paulo')::date))
  );
create policy "admin decide plantao" on public.escala_plantoes for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- check-in: todos leem (quem está atendendo agora); começar/encerrar só pelas funções; admin corrige
create policy "logado le checkins" on public.escala_checkins for select to authenticated using (true);
create policy "admin corrige checkin" on public.escala_checkins for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "admin le alteracoes de checkin" on public.escala_checkins_alteracoes
  for select to authenticated using ((select privado.eh_admin()));
