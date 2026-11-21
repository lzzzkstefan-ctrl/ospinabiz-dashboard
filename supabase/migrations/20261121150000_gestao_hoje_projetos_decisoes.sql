-- Central de gestão · Fase 2 (21/11/2026): Hoje, Projetos e Decisões.
-- Tudo aqui é só da gestão (app_metadata.gestao = true: Davi e Rodrigo). Contexto em
-- docs/modulos/gestao.md.
--
-- Números com `origem` ('manual' ou 'prime'): hoje são digitados; quando a API do Prime entrar, as
-- mesmas colunas passam a ser preenchidas por ela, sem refazer as telas.

-- ---------------------------------------------------------------------------
-- quem é da gestão
-- ---------------------------------------------------------------------------
create or replace function privado.eh_gestao()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'gestao', '') = 'true';
$$;

revoke execute on function privado.eh_gestao() from public, anon;
grant execute on function privado.eh_gestao() to authenticated;

-- atualizado_em sozinho em toda tabela nova
create or replace function privado.gestao_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- frentes de venda (a fase 3 acrescenta objetivo, meta, público, oferta, notas...)
-- ---------------------------------------------------------------------------
create table public.frentes (
  id            bigint generated always as identity primary key,
  slug          text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  nome          text not null check (length(nome) between 1 and 80),
  status        text not null default 'ideia' check (status in ('ideia', 'planejando', 'testando', 'rodando', 'pausado')),
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

insert into public.frentes (slug, nome, status, ordem) values
  ('x1-gcs', 'X1 · GCS', 'rodando', 1),
  ('viral-influencers', 'Viral via Influencers', 'ideia', 2),
  ('webinarios', 'Webinários', 'planejando', 3),
  ('lancamento', 'Lançamento', 'ideia', 4);

-- ---------------------------------------------------------------------------
-- Hoje: prioridades da semana (até 3, a tela confere) e números da semana
-- ---------------------------------------------------------------------------
create table public.prioridades (
  id            bigint generated always as identity primary key,
  semana        date not null check (extract(isodow from semana) = 1), -- segunda-feira da semana
  titulo        text not null check (length(titulo) between 1 and 160),
  descricao     text check (length(descricao) <= 2000),
  dono_id       bigint references public.equipe (id),
  prazo         date,
  ordem         integer not null default 0,
  concluida_em  timestamptz,
  criado_por    uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index prioridades_semana_idx on public.prioridades (semana);
create index prioridades_dono_idx on public.prioridades (dono_id);

create table public.numeros_semana (
  semana         date primary key check (extract(isodow from semana) = 1),
  investimento   numeric(12, 2) check (investimento >= 0),
  cpl            numeric(10, 2) check (cpl > 0),
  leads          integer check (leads >= 0), -- vazio = investimento ÷ CPL
  origem         text not null default 'manual' check (origem in ('manual', 'prime')),
  atualizado_por uuid references auth.users (id) on delete set null default auth.uid(),
  atualizado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projetos: iniciativas (kanban), checklist, links e comentários
-- ---------------------------------------------------------------------------
create table public.iniciativas (
  id            bigint generated always as identity primary key,
  titulo        text not null check (length(titulo) between 1 and 160),
  frente_id     bigint references public.frentes (id),
  objetivo      text check (length(objetivo) <= 300),
  dono_id       bigint references public.equipe (id),
  prazo         date,
  coluna        text not null default 'ideia' check (coluna in ('ideia', 'planejando', 'andamento', 'no_ar', 'pausado')),
  ordem         double precision not null default 0,
  criado_por    uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index iniciativas_frente_idx on public.iniciativas (frente_id);
create index iniciativas_dono_idx on public.iniciativas (dono_id);
create index iniciativas_coluna_idx on public.iniciativas (coluna, ordem);

create table public.iniciativa_itens (
  id             bigint generated always as identity primary key,
  iniciativa_id  bigint not null references public.iniciativas (id) on delete cascade,
  texto          text not null check (length(texto) between 1 and 300),
  responsavel_id bigint references public.equipe (id),
  prazo          date,
  feito_em       timestamptz,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index iniciativa_itens_iniciativa_idx on public.iniciativa_itens (iniciativa_id);
create index iniciativa_itens_responsavel_idx on public.iniciativa_itens (responsavel_id);

create table public.iniciativa_links (
  id            bigint generated always as identity primary key,
  iniciativa_id bigint not null references public.iniciativas (id) on delete cascade,
  titulo        text not null check (length(titulo) between 1 and 120),
  url           text not null check (url ~ '^https?://' and length(url) <= 2000),
  criado_em     timestamptz not null default now()
);
create index iniciativa_links_iniciativa_idx on public.iniciativa_links (iniciativa_id);

create table public.iniciativa_comentarios (
  id            bigint generated always as identity primary key,
  iniciativa_id bigint not null references public.iniciativas (id) on delete cascade,
  autor_id      uuid references auth.users (id) on delete set null default auth.uid(),
  texto         text not null check (length(texto) between 1 and 4000),
  criado_em     timestamptz not null default now()
);
create index iniciativa_comentarios_iniciativa_idx on public.iniciativa_comentarios (iniciativa_id);
create index iniciativa_comentarios_autor_idx on public.iniciativa_comentarios (autor_id);

-- iniciativas iniciais (colunas a ajustar na tela; dono e prazo vazios)
insert into public.iniciativas (titulo, frente_id, coluna, ordem)
select v.titulo, f.id, v.coluna, v.ordem
  from (values
    ('Funil em blocos com ganchos', 'x1-gcs', 'andamento', 1),
    ('Webinário com o Julio', 'webinarios', 'planejando', 1),
    ('Reels dos módulos ("Afiliado nunca mais")', 'x1-gcs', 'ideia', 1),
    ('Pesquisa GCS', 'x1-gcs', 'andamento', 2),
    ('Viral via influencers', 'viral-influencers', 'ideia', 2),
    ('Lançamento', 'lancamento', 'ideia', 3)
  ) as v (titulo, slug, coluna, ordem)
  join public.frentes f on f.slug = v.slug;

-- ---------------------------------------------------------------------------
-- Decisões e pauta da reunião semanal
-- ---------------------------------------------------------------------------
create table public.decisoes (
  id            bigint generated always as identity primary key,
  data          date not null default (now() at time zone 'America/Sao_Paulo')::date,
  decisao       text not null check (length(decisao) between 1 and 500),
  porque        text check (length(porque) <= 4000),
  quem_id       bigint references public.equipe (id), -- quem decidiu (ou, se pendente, quem decide)
  frente_id     bigint references public.frentes (id),
  iniciativa_id bigint references public.iniciativas (id) on delete set null,
  status        text not null default 'pendente' check (status in ('pendente', 'decidido', 'revisar')),
  criado_por    uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index decisoes_status_idx on public.decisoes (status, data desc);
create index decisoes_quem_idx on public.decisoes (quem_id);
create index decisoes_frente_idx on public.decisoes (frente_id);
create index decisoes_iniciativa_idx on public.decisoes (iniciativa_id);

create table public.pauta_itens (
  id                 bigint generated always as identity primary key,
  assunto            text not null check (length(assunto) between 1 and 200),
  detalhe            text check (length(detalhe) <= 2000),
  criado_por         uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em          timestamptz not null default now(),
  resolvido_em       timestamptz,
  virou              text check (virou in ('decisao', 'tarefa', 'descartado')),
  decisao_id         bigint references public.decisoes (id) on delete set null,
  iniciativa_item_id bigint references public.iniciativa_itens (id) on delete set null,
  check ((virou is null) = (resolvido_em is null))
);
create index pauta_itens_abertos_idx on public.pauta_itens (criado_em) where resolvido_em is null;
create index pauta_itens_decisao_idx on public.pauta_itens (decisao_id);
create index pauta_itens_item_idx on public.pauta_itens (iniciativa_item_id);

-- ---------------------------------------------------------------------------
-- atualizado_em, RLS (só gestão) e permissões
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['frentes', 'prioridades', 'numeros_semana', 'iniciativas', 'iniciativa_itens', 'decisoes'] loop
    execute format('create trigger gestao_atualizado_em before update on public.%I for each row execute function privado.gestao_atualizado_em()', t);
  end loop;

  foreach t in array array['frentes', 'prioridades', 'numeros_semana', 'iniciativas', 'iniciativa_itens', 'iniciativa_links', 'iniciativa_comentarios', 'decisoes', 'pauta_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "gestao le" on public.%I for select to authenticated using ((select privado.eh_gestao()))', t);
    execute format('create policy "gestao cria" on public.%I for insert to authenticated with check ((select privado.eh_gestao()))', t);
    execute format('create policy "gestao altera" on public.%I for update to authenticated using ((select privado.eh_gestao())) with check ((select privado.eh_gestao()))', t);
    execute format('create policy "gestao apaga" on public.%I for delete to authenticated using ((select privado.eh_gestao()))', t);
  end loop;
end;
$$;

-- comentário: só o autor edita ou apaga o próprio
drop policy "gestao altera" on public.iniciativa_comentarios;
drop policy "gestao apaga" on public.iniciativa_comentarios;
create policy "autor altera" on public.iniciativa_comentarios for update to authenticated
  using ((select privado.eh_gestao()) and autor_id = (select auth.uid()))
  with check ((select privado.eh_gestao()) and autor_id = (select auth.uid()));
create policy "autor apaga" on public.iniciativa_comentarios for delete to authenticated
  using ((select privado.eh_gestao()) and autor_id = (select auth.uid()));
