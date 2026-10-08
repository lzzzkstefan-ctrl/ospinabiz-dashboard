-- Vendas: plataformas configuráveis (nome, cor, ativa), com "+ plataforma" na Configuração.
-- - vendas.plataforma continua sendo o código (slug) da plataforma: 'hubla', 'kirvano'...
--   Em vez da lista fixa (check), passa a apontar para public.plataformas.
-- - Hubla e Kirvano entram cadastradas; as vendas que já existem não mudam.
-- - Só a Hubla tem webhook: as outras são para lançamento manual.
-- - Plataforma não se apaga (venda antiga aponta para ela): só desativa (some do "Nova venda").

create table public.plataformas (
  slug       text primary key check (slug ~ '^[a-z0-9-]{1,40}$'),
  nome       text not null unique check (length(trim(nome)) between 1 and 40),
  cor        text not null default '#8a96a3' check (cor ~ '^#[0-9a-f]{6}$'),
  ativa      boolean not null default true,
  ordem      integer not null default 0,
  criado_em  timestamptz not null default now()
);

insert into public.plataformas (slug, nome, cor, ordem) values
  ('hubla', 'Hubla', '#22c55e', 0),
  ('kirvano', 'Kirvano', '#a855f7', 1);

alter table public.vendas drop constraint vendas_plataforma_check;
alter table public.vendas
  add constraint vendas_plataforma_fkey foreign key (plataforma) references public.plataformas (slug);
create index vendas_plataforma_idx on public.vendas (plataforma);

-- RLS: todo logado lê (o card mostra nome e cor); só admin cria e edita; ninguém apaga.
alter table public.plataformas enable row level security;
revoke all on public.plataformas from anon;
grant select, insert, update on public.plataformas to authenticated;

create policy "logado le plataformas" on public.plataformas
  for select to authenticated using (true);
create policy "admin cria plataforma" on public.plataformas
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita plataforma" on public.plataformas
  for update to authenticated using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
