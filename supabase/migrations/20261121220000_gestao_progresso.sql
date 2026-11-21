-- Central de gestão · Progresso (21/11/2026): diário do que foi feito e do que isso gerou, com XP.
-- Só a gestão (Davi e Rodrigo). O resto do XP vem sozinho do que já existe (itens de projeto feitos,
-- prioridades concluídas, decisões tomadas); esta tabela guarda só o que é digitado à mão.
-- Contexto em docs/modulos/gestao.md.

create table public.registros (
  id         bigint generated always as identity primary key,
  data       date not null default (now() at time zone 'America/Sao_Paulo')::date,
  titulo     text not null check (length(titulo) between 1 and 160),       -- o que foi feito
  resultado  text check (length(resultado) <= 500),                        -- o que isso gerou
  tipo       text not null default 'entrega'
             check (tipo in ('entrega', 'negocio', 'conteudo', 'alinhamento', 'aprendizado', 'ajuste')),
  tamanho    text not null default 'm' check (tamanho in ('p', 'm', 'g')), -- vira XP na tela (P 15, M 40, G 80)
  link       text check (link is null or (link ~ '^https?://' and length(link) <= 2000)),
  frente_id  bigint references public.frentes (id) on delete set null,
  autor_id   uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em  timestamptz not null default now()
);
create index registros_data_idx on public.registros (data desc);
create index registros_autor_idx on public.registros (autor_id);
create index registros_frente_idx on public.registros (frente_id);

alter table public.registros enable row level security;
revoke all on public.registros from anon;
grant select, insert, update, delete on public.registros to authenticated;

-- a gestão vê tudo; cada um cria, edita e apaga só o que é seu
create policy "gestao le" on public.registros for select to authenticated
  using ((select privado.eh_gestao()));
create policy "gestao cria o seu" on public.registros for insert to authenticated
  with check ((select privado.eh_gestao()) and autor_id = (select auth.uid()));
create policy "autor altera" on public.registros for update to authenticated
  using ((select privado.eh_gestao()) and autor_id = (select auth.uid()))
  with check ((select privado.eh_gestao()) and autor_id = (select auth.uid()));
create policy "autor apaga" on public.registros for delete to authenticated
  using ((select privado.eh_gestao()) and autor_id = (select auth.uid()));
