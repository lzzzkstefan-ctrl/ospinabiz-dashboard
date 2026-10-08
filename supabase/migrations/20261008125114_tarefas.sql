-- Tarefas da operação. "Atrasada" não é guardada: é pendente com prazo antes de
-- hoje (calculado no horário de Brasília), assim nunca fica desatualizada.
-- Qualquer usuário logado vê, cria, edita, conclui e reabre. Ninguém apaga.

create table public.tarefas (
  id              bigint generated always as identity primary key,
  titulo          text not null check (length(btrim(titulo)) between 1 and 200),
  responsavel_id  bigint references public.equipe (id),
  prazo           date,
  status          text not null default 'pendente' check (status in ('pendente', 'concluida')),
  bm_id           bigint references public.monitor_bms (id),
  numero_id       bigint references public.monitor_numeros (id),
  criado_por      uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em       timestamptz not null default now(),
  concluida_em    timestamptz,
  -- vínculo opcional com UMA BM ou UM número, nunca os dois
  constraint tarefas_um_vinculo check (bm_id is null or numero_id is null)
);

create index tarefas_status_prazo_idx on public.tarefas (status, prazo);
create index tarefas_responsavel_id_idx on public.tarefas (responsavel_id);
create index tarefas_bm_id_idx on public.tarefas (bm_id);
create index tarefas_numero_id_idx on public.tarefas (numero_id);
create index tarefas_criado_por_idx on public.tarefas (criado_por);

-- ---------------------------------------------------------------------------
-- concluida_em acompanha o status sozinho: preenche ao concluir, limpa ao reabrir.
-- Numa edição, quem criou e quando criou não mudam.
-- ---------------------------------------------------------------------------
create or replace function privado.tarefas_marca_conclusao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.criado_por := old.criado_por;
    new.criado_em  := old.criado_em;
  end if;

  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status <> 'concluida') then
    new.concluida_em := coalesce(new.concluida_em, now());
  elsif new.status = 'pendente' then
    new.concluida_em := null;
  end if;
  return new;
end;
$$;

revoke execute on function privado.tarefas_marca_conclusao() from public, anon, authenticated;

create trigger tarefas_marca_conclusao
  before insert or update on public.tarefas
  for each row execute function privado.tarefas_marca_conclusao();

-- ---------------------------------------------------------------------------
-- RLS: logado lê, cria (sempre em nome próprio) e edita. Sem delete.
-- ---------------------------------------------------------------------------
alter table public.tarefas enable row level security;

revoke all on public.tarefas from anon;
grant select, insert, update on public.tarefas to authenticated;

create policy "logado le tarefas" on public.tarefas
  for select to authenticated using (true);
create policy "logado cria tarefa em nome proprio" on public.tarefas
  for insert to authenticated with check (criado_por = (select auth.uid()));
create policy "logado edita tarefas" on public.tarefas
  for update to authenticated using (true) with check (true);
