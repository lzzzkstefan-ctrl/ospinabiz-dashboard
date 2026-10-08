-- Organização das BMs e números: equipe (responsáveis), limite, acesso de admin
-- e situação. Os dados reais (BMs, finais, responsáveis) NÃO ficam aqui: entram
-- direto no banco, fora do git.
--
-- Regra do monitor: só testa número com situacao = 'operacao', ativo = true,
-- BM ativa e telefone completo preenchido.

-- ---------------------------------------------------------------------------
-- equipe: pessoas que podem ser responsáveis por números e tarefas.
-- usuario_id liga a pessoa ao login dela (opcional: o Rodrigo pode ser
-- responsável antes de ter conta).
-- ---------------------------------------------------------------------------
create table public.equipe (
  id          bigint generated always as identity primary key,
  nome        text not null unique,
  usuario_id  uuid unique references auth.users (id) on delete set null,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- monitor_bms: temos acesso de admin a essa BM?
-- ---------------------------------------------------------------------------
alter table public.monitor_bms
  add column acesso_admin boolean not null default false;

-- ---------------------------------------------------------------------------
-- monitor_numeros: final (4 últimos dígitos), limite, responsável e situação.
-- O telefone completo passa a ser opcional (preenchido depois pela tela);
-- quando existir, tem que terminar com o final cadastrado.
-- ---------------------------------------------------------------------------
alter table public.monitor_numeros
  alter column telefone drop not null,
  add column final          text not null check (final ~ '^[0-9]{4}$'),
  add column limite         integer check (limite > 0),
  add column responsavel_id bigint references public.equipe (id),
  add column situacao       text not null default 'operacao'
                            check (situacao in ('operacao', 'desconectado')),
  add constraint monitor_numeros_final_bate_telefone
    check (telefone is null or right(telefone, 4) = final),
  -- o mesmo final não se repete dentro da mesma BM
  add constraint monitor_numeros_bm_final_unico unique (bm_id, final);

create index monitor_numeros_responsavel_id_idx on public.monitor_numeros (responsavel_id);

-- ---------------------------------------------------------------------------
-- RLS da equipe: logado lê; só admin cadastra e edita.
-- ---------------------------------------------------------------------------
alter table public.equipe enable row level security;

revoke all on public.equipe from anon;
grant select, insert, update on public.equipe to authenticated;

create policy "logado le equipe" on public.equipe
  for select to authenticated using (true);
create policy "admin cria equipe" on public.equipe
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita equipe" on public.equipe
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
