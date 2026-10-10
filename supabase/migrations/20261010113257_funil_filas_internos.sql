-- Funil: filas da Data Crazy e números internos (pedido do Davi, 10/10/2026).
--
-- 1. Filas: a conversa em aberto fica numa fila como no CRM. Vem de `statuses` da API:
--      "unstarted" → nao_iniciado (ninguém assumiu o atendimento)
--      "opened"    → aberto (Em aberto)
--      outro status de conversa aberta → aguardando (a confirmar: hoje o CRM mostra 0)
--    fila_desde = início do atendimento atual (currentThread.createdAt), senão a criação da conversa.
--    Fechada (finalizada ou arquivada) = fila vazia.
--
-- 2. Números internos (teste): ficam fora de TODA a dashboard do Funil. Só o admin vê e cadastra.
--    A comparação é pelos 8 últimos dígitos (não depende de +55, DDD ou 9 extra).
--    A sincronização marca `interno` em funil_leads e funil_conversas (o telefone do lead/contato
--    não é copiado para essas tabelas); as telas filtram interno = false.
--    O telefone fica só aqui no banco, nunca no código nem no git.

-- ---------------------------------------------------------------------------
-- 1. Filas
-- ---------------------------------------------------------------------------
alter table public.funil_conversas
  add column fila text check (fila in ('nao_iniciado', 'aberto', 'aguardando')),
  add column fila_desde timestamptz,
  add column interno boolean not null default false;

comment on column public.funil_conversas.fila is
  'Fila da conversa aberta na Data Crazy (statuses): nao_iniciado = unstarted, aberto = opened, aguardando = outro status aberto. Null = fechada.';
comment on column public.funil_conversas.fila_desde is
  'Desde quando a conversa está no atendimento atual (currentThread.createdAt ou criação da conversa).';
comment on column public.funil_conversas.interno is
  'Contato é um número interno (funil_numeros_internos): fica fora da dashboard.';

create index funil_conversas_fila_idx on public.funil_conversas (fila) where fila is not null;

-- ---------------------------------------------------------------------------
-- 2. Números internos
-- ---------------------------------------------------------------------------
alter table public.funil_leads add column interno boolean not null default false;
comment on column public.funil_leads.interno is
  'Lead é um número interno (funil_numeros_internos): fica fora de leads por dia, funil, conversão e primeira resposta.';

create table public.funil_numeros_internos (
  id          bigint generated always as identity primary key,
  nome        text not null check (length(trim(nome)) between 1 and 80),
  telefone    text not null check (telefone ~ '^[0-9]{8,15}$'),
  -- 8 últimos dígitos: a chave de comparação
  chave       text generated always as (right(telefone, 8)) stored unique,
  criado_por  uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now()
);

create index funil_numeros_internos_criado_por_idx on public.funil_numeros_internos (criado_por);

alter table public.funil_numeros_internos enable row level security;
revoke all on public.funil_numeros_internos from anon, authenticated;
grant select, delete on public.funil_numeros_internos to authenticated;
grant insert (nome, telefone) on public.funil_numeros_internos to authenticated;

create policy "admin le numeros internos" on public.funil_numeros_internos
  for select to authenticated using ((select privado.eh_admin()));
create policy "admin cadastra numero interno" on public.funil_numeros_internos
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin apaga numero interno" on public.funil_numeros_internos
  for delete to authenticated using ((select privado.eh_admin()));
