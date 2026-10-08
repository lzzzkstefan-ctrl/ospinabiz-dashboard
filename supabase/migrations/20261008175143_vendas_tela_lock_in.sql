-- Vendas: a tela do Lock in (masterview), por vendedor.
-- Valores em reais (numeric), como no resto do módulo. Nada de dado real aqui: cores,
-- nomes dos tickets e o WhatsApp do Rodrigo entram por script/tela depois.

-- ---------------------------------------------------------------------------
-- 1. Tickets: etiqueta igual à do Lock in (nome, cor, ordem na tela, provisório).
-- ---------------------------------------------------------------------------
alter table public.tickets
  add column nome       text,
  add column cor        text check (cor is null or cor ~ '^#[0-9a-f]{6}$'),
  add column ordem      integer not null default 0,
  add column provisorio boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Venda sem ticket: "sem comissão (produto)" (o principal é combo/produto, sem
--    comissão por regra) x "a revisar" (deveria ter ticket e não casou).
-- ---------------------------------------------------------------------------
alter table public.vendas
  add column principal_produto boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Adiantamentos por vendedor e mês: descontam do "a receber".
-- ---------------------------------------------------------------------------
create table public.vendas_adiantamentos (
  id           bigint generated always as identity primary key,
  vendedor_id  bigint not null references public.equipe (id),
  mes          date not null check (extract(day from mes) = 1),
  valor        numeric(12, 2) not null check (valor > 0),
  data         date not null,
  criado_por   uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em    timestamptz not null default now(),
  check (date_trunc('month', data)::date = mes)
);
create index vendas_adiantamentos_vendedor_mes_idx on public.vendas_adiantamentos (vendedor_id, mes);
create index vendas_adiantamentos_criado_por_idx on public.vendas_adiantamentos (criado_por);

-- ---------------------------------------------------------------------------
-- 4. Observações e link público do mês, por vendedor.
--    codigo_publico: aleatório (gerado no servidor); null = sem link / desativado.
-- ---------------------------------------------------------------------------
create table public.vendas_meses_vendedor (
  mes             date not null check (extract(day from mes) = 1),
  vendedor_id     bigint not null references public.equipe (id),
  observacoes     text not null default '' check (length(observacoes) <= 4000),
  codigo_publico  text unique check (codigo_publico is null or length(codigo_publico) >= 32),
  atualizado_em   timestamptz not null default now(),
  primary key (mes, vendedor_id)
);
create index vendas_meses_vendedor_vendedor_idx on public.vendas_meses_vendedor (vendedor_id);

-- ---------------------------------------------------------------------------
-- 5. Configuração do módulo (uma linha só): WhatsApp do Rodrigo. Só admin lê.
-- ---------------------------------------------------------------------------
create table public.vendas_config (
  id                   boolean primary key default true check (id),
  whatsapp_fechamento  text check (whatsapp_fechamento is null or whatsapp_fechamento ~ '^\d{10,15}$'),
  atualizado_em        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.vendas_adiantamentos  enable row level security;
alter table public.vendas_meses_vendedor enable row level security;
alter table public.vendas_config         enable row level security;

revoke all on public.vendas_adiantamentos, public.vendas_meses_vendedor, public.vendas_config from anon;
grant select, insert, update, delete on public.vendas_adiantamentos to authenticated;
grant select, insert, update on public.vendas_meses_vendedor, public.vendas_config to authenticated;

-- adiantamentos: admin faz tudo; vendedor só lê os dele
create policy "le adiantamentos: admin tudo, vendedor os proprios" on public.vendas_adiantamentos
  for select to authenticated
  using ((select privado.eh_admin()) or vendedor_id = (select privado.minha_equipe_id()));
create policy "admin cria adiantamento" on public.vendas_adiantamentos
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita adiantamento" on public.vendas_adiantamentos
  for update to authenticated using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
create policy "admin apaga adiantamento" on public.vendas_adiantamentos
  for delete to authenticated using ((select privado.eh_admin()));

-- observações/link do mês: admin faz tudo; vendedor só lê os dele
create policy "le mes do vendedor: admin tudo, vendedor o proprio" on public.vendas_meses_vendedor
  for select to authenticated
  using ((select privado.eh_admin()) or vendedor_id = (select privado.minha_equipe_id()));
create policy "admin cria mes do vendedor" on public.vendas_meses_vendedor
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita mes do vendedor" on public.vendas_meses_vendedor
  for update to authenticated using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- config: só admin
create policy "admin le config de vendas" on public.vendas_config
  for select to authenticated using ((select privado.eh_admin()));
create policy "admin cria config de vendas" on public.vendas_config
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita config de vendas" on public.vendas_config
  for update to authenticated using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
