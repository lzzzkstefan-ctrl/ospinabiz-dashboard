-- Fechamento do mês POR VENDEDOR: o admin escolhe o % (6 a 10) de cada um.
-- O sistema sugere a faixa pela margem da operação (faixa_sugerida); o % gravado
-- aqui é o que vale. Os totais ficam congelados no momento do fechamento.
-- Valores em reais (numeric), como no resto do módulo.

create table public.vendas_fechamentos (
  mes             date    not null check (extract(day from mes) = 1),
  vendedor_id     bigint  not null references public.equipe (id),
  faixa           integer not null check (faixa in (6, 7, 8, 9, 10)),
  faixa_sugerida  integer check (faixa_sugerida in (6, 7, 8, 9, 10)),
  qtd             integer not null check (qtd >= 0),        -- vendas pagas com ticket
  sem_ticket      integer not null check (sem_ticket >= 0), -- pagas sem ticket (sem comissão)
  bruto           numeric(12, 2) not null check (bruto >= 0),
  liquido         numeric(12, 2) not null check (liquido >= 0),
  comissao        numeric(12, 2) not null check (comissao >= 0),
  reembolsos      integer not null check (reembolsos >= 0),
  chargebacks     integer not null check (chargebacks >= 0),
  fechado_em      timestamptz not null default now(),
  fechado_por     uuid references auth.users (id) on delete set null,
  primary key (mes, vendedor_id)
);

create index vendas_fechamentos_vendedor_id_idx on public.vendas_fechamentos (vendedor_id);
create index vendas_fechamentos_fechado_por_idx on public.vendas_fechamentos (fechado_por);

alter table public.vendas_fechamentos enable row level security;

revoke all on public.vendas_fechamentos from anon;
grant select, insert, update on public.vendas_fechamentos to authenticated;

-- admin lê tudo; vendedor lê só os próprios fechamentos
create policy "le fechamentos: admin tudo, vendedor os proprios" on public.vendas_fechamentos
  for select to authenticated
  using (
    (select privado.eh_admin())
    or vendedor_id = (select privado.minha_equipe_id())
  );

create policy "admin cria fechamento" on public.vendas_fechamentos
  for insert to authenticated with check ((select privado.eh_admin()));

create policy "admin edita fechamento" on public.vendas_fechamentos
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
