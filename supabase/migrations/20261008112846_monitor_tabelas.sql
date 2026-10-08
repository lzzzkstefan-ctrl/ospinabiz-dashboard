-- Módulo Monitor: tabelas dos números de WhatsApp monitorados e dos testes 2x por dia.
-- Contexto em docs/modulos/monitor.md.
--
-- Quem escreve: só o servidor (rotas app/api com a chave secreta, que ignora RLS).
-- Quem lê: qualquer usuário logado (admin ou atendente), pela tela do monitor.
-- Quem edita BMs e números pela tela: só admin (papel em app_metadata.papel).
-- Os jobs do pg_cron ficam numa migration separada, depois que a URL da Vercel existir.

-- ---------------------------------------------------------------------------
-- Função de apoio: o usuário logado é admin?
-- Lê app_metadata (o usuário não consegue editar), nunca user_metadata.
-- ---------------------------------------------------------------------------
create schema if not exists privado;

create or replace function privado.eh_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'papel', '') = 'admin';
$$;

revoke execute on function privado.eh_admin() from public, anon;
grant usage on schema privado to authenticated;
grant execute on function privado.eh_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- monitor_bms: cada BM (Business Manager) da operação.
-- ---------------------------------------------------------------------------
create table public.monitor_bms (
  id         bigint generated always as identity primary key,
  nome       text not null unique,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- monitor_numeros: os números de WhatsApp que recebem o teste.
-- telefone no formato internacional só com dígitos (ex.: 5511999990348).
-- ---------------------------------------------------------------------------
create table public.monitor_numeros (
  id         bigint generated always as identity primary key,
  bm_id      bigint not null references public.monitor_bms (id),
  telefone   text not null unique check (telefone ~ '^[0-9]{10,15}$'),
  apelido    text not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create index monitor_numeros_bm_id_idx on public.monitor_numeros (bm_id);

-- ---------------------------------------------------------------------------
-- monitor_testes: cada rodada de teste (7h30, 17h ou botão manual).
-- ---------------------------------------------------------------------------
create table public.monitor_testes (
  id                 bigint generated always as identity primary key,
  origem             text not null check (origem in ('cron', 'manual')),
  disparado_por      uuid references auth.users (id) on delete set null,
  situacao           text not null default 'enviando'
                     check (situacao in ('enviando', 'aguardando', 'fechado')),
  iniciado_em        timestamptz not null default now(),
  fechado_em         timestamptz,
  total_numeros      integer,
  total_ok           integer,
  alerta_enviado_em  timestamptz
);

create index monitor_testes_iniciado_em_idx on public.monitor_testes (iniciado_em desc);
create index monitor_testes_disparado_por_idx on public.monitor_testes (disparado_por);

-- ---------------------------------------------------------------------------
-- monitor_resultados: uma linha por número em cada teste.
-- status_meta vem do webhook; resultado é decidido quando o teste fecha.
-- ---------------------------------------------------------------------------
create table public.monitor_resultados (
  id               bigint generated always as identity primary key,
  teste_id         bigint not null references public.monitor_testes (id) on delete cascade,
  numero_id        bigint not null references public.monitor_numeros (id),
  meta_message_id  text,
  status_meta      text check (status_meta in ('sent', 'delivered', 'read', 'failed')),
  erro_codigo      text,
  erro_mensagem    text,
  respondeu_em     timestamptz,
  resultado        text check (resultado in ('ok', 'falhou', 'sem_resposta')),
  enviado_em       timestamptz,
  atualizado_em    timestamptz not null default now(),
  -- Uma linha só por número em cada teste.
  constraint monitor_resultados_teste_numero_unico unique (teste_id, numero_id),
  -- Cada mensagem da Meta casa com uma linha só. Fica vazio até a Meta devolver o id.
  constraint monitor_resultados_meta_message_id_unico unique (meta_message_id)
);

create index monitor_resultados_numero_id_idx on public.monitor_resultados (numero_id);

-- ---------------------------------------------------------------------------
-- O status da Meta nunca regride.
-- A Meta pode mandar os avisos fora de ordem (ex.: um "sent" atrasado depois do
-- "delivered"). Ordem: sent < failed < delivered < read. Se chegar um status de
-- ordem menor que o atual, o banco mantém o atual (e o erro que veio com ele).
-- "failed" fica abaixo de "delivered": se a Meta já confirmou a entrega, a
-- mensagem chegou no aparelho, e um "failed" depois disso não desfaz isso.
-- ---------------------------------------------------------------------------
create or replace function privado.monitor_resultados_nao_regride()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ordem constant text[] := array['sent', 'failed', 'delivered', 'read'];
begin
  if coalesce(array_position(ordem, new.status_meta), 0)
     < coalesce(array_position(ordem, old.status_meta), 0) then
    new.status_meta   := old.status_meta;
    new.erro_codigo   := old.erro_codigo;
    new.erro_mensagem := old.erro_mensagem;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

revoke execute on function privado.monitor_resultados_nao_regride() from public, anon, authenticated;

create trigger monitor_resultados_nao_regride
  before update on public.monitor_resultados
  for each row execute function privado.monitor_resultados_nao_regride();

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------
alter table public.monitor_bms        enable row level security;
alter table public.monitor_numeros    enable row level security;
alter table public.monitor_testes     enable row level security;
alter table public.monitor_resultados enable row level security;

revoke all on public.monitor_bms, public.monitor_numeros,
              public.monitor_testes, public.monitor_resultados from anon;

grant select on public.monitor_bms, public.monitor_numeros,
                public.monitor_testes, public.monitor_resultados to authenticated;
grant insert, update on public.monitor_bms, public.monitor_numeros to authenticated;

-- Leitura: qualquer usuário logado (admin ou atendente).
create policy "logado le bms" on public.monitor_bms
  for select to authenticated using (true);
create policy "logado le numeros" on public.monitor_numeros
  for select to authenticated using (true);
create policy "logado le testes" on public.monitor_testes
  for select to authenticated using (true);
create policy "logado le resultados" on public.monitor_resultados
  for select to authenticated using (true);

-- Cadastro de BMs e números pela tela: só admin.
create policy "admin cria bm" on public.monitor_bms
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita bm" on public.monitor_bms
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
create policy "admin cria numero" on public.monitor_numeros
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita numero" on public.monitor_numeros
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
