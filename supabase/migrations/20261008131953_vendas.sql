-- Módulo Vendas: vendas da Hubla (webhook), atribuição a vendedores, tickets e
-- comissão, custos e margem do mês. Regras em docs/modulos/vendas.md.
-- Dados reais (tickets, custos, vendedores) entram direto no banco, fora do git.
--
-- Quem grava vendas e eventos: só o servidor (webhook e ações, com a chave secreta).
-- Dados de cliente (nome, telefone, e-mail) e o payload bruto: só admin lê.

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------
-- id da pessoa logada na equipe (null se não estiver na equipe)
create or replace function privado.minha_equipe_id()
returns bigint
language sql
stable
set search_path = ''
as $$
  select id from public.equipe where usuario_id = (select auth.uid());
$$;

revoke execute on function privado.minha_equipe_id() from public, anon;
grant execute on function privado.minha_equipe_id() to authenticated;

-- ---------------------------------------------------------------------------
-- vendedores: liga a pessoa da equipe ao código do link (utm_term).
-- ---------------------------------------------------------------------------
create table public.vendedores (
  equipe_id  bigint primary key references public.equipe (id),
  utm_term   text not null unique check (utm_term ~ '^[a-z0-9_-]{1,40}$'),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tickets: tabela oficial de preço, líquido e comissão unitária por faixa.
-- A comissão NUNCA é calculada por porcentagem: soma o valor pronto da faixa.
-- ---------------------------------------------------------------------------
create table public.tickets (
  id            bigint generated always as identity primary key,
  valor_bruto   numeric(10, 2) not null unique check (valor_bruto > 0),
  valor_liquido numeric(10, 2) not null check (valor_liquido >= 0),
  comissao_6    numeric(10, 2) not null check (comissao_6 >= 0),
  comissao_7    numeric(10, 2) not null check (comissao_7 >= 0),
  comissao_8    numeric(10, 2) not null check (comissao_8 >= 0),
  comissao_9    numeric(10, 2) not null check (comissao_9 >= 0),
  comissao_10   numeric(10, 2) not null check (comissao_10 >= 0),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- vendas: uma linha por fatura aprovada na Hubla.
-- vendedor_id vazio + sem_vendedor = não  → "A atribuir".
-- sem_vendedor = sim                       → admin marcou que não é de nenhum vendedor.
-- ---------------------------------------------------------------------------
create table public.vendas (
  id                 bigint generated always as identity primary key,
  id_fatura          text not null unique,
  vendedor_id        bigint references public.equipe (id),
  sem_vendedor       boolean not null default false,
  forma_atribuicao   text check (forma_atribuicao in ('utm', 'manual')),
  atribuida_por      uuid references auth.users (id) on delete set null,
  atribuida_em       timestamptz,
  utm_term           text,
  ticket_id          bigint references public.tickets (id),
  motivo_sem_ticket  text,
  itens              text[] not null default '{}',
  bumps              text[] not null default '{}',
  valor_pago         numeric(10, 2),            -- só referência; os totais usam a tabela de tickets
  status             text not null default 'pago' check (status in ('pago', 'reembolso', 'chargeback')),
  pago_em            timestamptz,
  data               date not null,             -- dia da venda em Brasília
  reembolsado_em     timestamptz,
  final_lead         text check (final_lead ~ '^[0-9]{4}$'),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint vendas_dono_coerente check (not (sem_vendedor and vendedor_id is not null))
);

create index vendas_data_idx on public.vendas (data);
create index vendas_vendedor_id_idx on public.vendas (vendedor_id);
create index vendas_ticket_id_idx on public.vendas (ticket_id);
create index vendas_atribuida_por_idx on public.vendas (atribuida_por);
create index vendas_a_atribuir_idx on public.vendas (data) where vendedor_id is null and not sem_vendedor;

-- dados do comprador: tabela separada, só admin lê
create table public.vendas_clientes (
  venda_id  bigint primary key references public.vendas (id) on delete cascade,
  nome      text,
  telefone  text,
  email     text
);

-- histórico de atribuição (quem atribuiu, para quem, quando)
create table public.vendas_atribuicoes (
  id                bigint generated always as identity primary key,
  venda_id          bigint not null references public.vendas (id) on delete cascade,
  de_vendedor_id    bigint references public.equipe (id),
  para_vendedor_id  bigint references public.equipe (id),
  sem_vendedor      boolean not null default false,
  forma             text not null check (forma in ('utm', 'e_minha', 'admin')),
  por               uuid references auth.users (id) on delete set null,
  em                timestamptz not null default now()
);

create index vendas_atribuicoes_venda_id_idx on public.vendas_atribuicoes (venda_id);
create index vendas_atribuicoes_de_idx on public.vendas_atribuicoes (de_vendedor_id);
create index vendas_atribuicoes_para_idx on public.vendas_atribuicoes (para_vendedor_id);
create index vendas_atribuicoes_por_idx on public.vendas_atribuicoes (por);

-- ---------------------------------------------------------------------------
-- hubla_eventos: toda entrega do webhook, gravada ANTES de processar.
-- Se o processamento falhar, fica com erro e dá para reprocessar.
-- ---------------------------------------------------------------------------
create table public.hubla_eventos (
  id             bigint generated always as identity primary key,
  recebido_em    timestamptz not null default now(),
  tipo           text,
  id_fatura      text,
  payload        jsonb not null,
  processado     boolean not null default false,
  resultado      text,
  erro           text,
  tentativas     integer not null default 0,
  processado_em  timestamptz,
  venda_id       bigint references public.vendas (id)
);

create index hubla_eventos_id_fatura_idx on public.hubla_eventos (id_fatura);
create index hubla_eventos_venda_id_idx on public.hubla_eventos (venda_id);
create index hubla_eventos_pendentes_idx on public.hubla_eventos (recebido_em) where not processado or erro is not null;

-- ---------------------------------------------------------------------------
-- Custos fixos com histórico: o valor vale a partir de um mês (vigente_desde).
-- Mudar o valor em novembro não altera outubro. Desativar = a partir de um mês.
-- ---------------------------------------------------------------------------
create table public.custos_fixos (
  id                bigint generated always as identity primary key,
  nome              text not null unique,
  desativado_desde  date check (desativado_desde is null or extract(day from desativado_desde) = 1),
  criado_em         timestamptz not null default now()
);

create table public.custos_fixos_valores (
  id             bigint generated always as identity primary key,
  custo_id       bigint not null references public.custos_fixos (id) on delete cascade,
  vigente_desde  date not null check (extract(day from vigente_desde) = 1),
  valor          numeric(10, 2) check (valor >= 0),   -- vazio = valor ainda não informado
  unique (custo_id, vigente_desde)
);

-- ---------------------------------------------------------------------------
-- vendas_meses: o que o admin digita por mês para calcular a margem.
-- ---------------------------------------------------------------------------
create table public.vendas_meses (
  mes              date primary key check (extract(day from mes) = 1),
  gasto_anuncios   numeric(12, 2) check (gasto_anuncios >= 0),
  imposto_meta     numeric(12, 2) check (imposto_meta >= 0),
  custo_mensagens  numeric(12, 2) check (custo_mensagens >= 0),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid references auth.users (id) on delete set null
);

create index vendas_meses_atualizado_por_idx on public.vendas_meses (atualizado_por);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.vendedores           enable row level security;
alter table public.tickets              enable row level security;
alter table public.vendas               enable row level security;
alter table public.vendas_clientes      enable row level security;
alter table public.vendas_atribuicoes   enable row level security;
alter table public.hubla_eventos        enable row level security;
alter table public.custos_fixos         enable row level security;
alter table public.custos_fixos_valores enable row level security;
alter table public.vendas_meses         enable row level security;

revoke all on public.vendedores, public.tickets, public.vendas, public.vendas_clientes,
              public.vendas_atribuicoes, public.hubla_eventos, public.custos_fixos,
              public.custos_fixos_valores, public.vendas_meses from anon;

grant select on public.vendedores, public.tickets, public.vendas, public.vendas_clientes,
                public.vendas_atribuicoes, public.hubla_eventos, public.custos_fixos,
                public.custos_fixos_valores, public.vendas_meses to authenticated;
grant insert, update on public.vendedores, public.tickets, public.custos_fixos,
                        public.custos_fixos_valores, public.vendas_meses to authenticated;

-- vendedores e tickets: logado lê (o vendedor precisa para ver a própria comissão); admin edita
create policy "logado le vendedores" on public.vendedores for select to authenticated using (true);
create policy "admin cria vendedor" on public.vendedores for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita vendedor" on public.vendedores for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "logado le tickets" on public.tickets for select to authenticated using (true);
create policy "admin cria ticket" on public.tickets for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita ticket" on public.tickets for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- vendas: admin vê tudo; vendedor vê as próprias e as "A atribuir". Gravação só pelo servidor.
create policy "admin le vendas" on public.vendas for select to authenticated
  using ((select privado.eh_admin()));
create policy "vendedor le as proprias e a atribuir" on public.vendas for select to authenticated
  using (
    vendedor_id = (select privado.minha_equipe_id())
    or (vendedor_id is null and not sem_vendedor)
  );

-- só admin: dados de cliente, histórico, eventos, custos e meses
create policy "admin le clientes" on public.vendas_clientes for select to authenticated using ((select privado.eh_admin()));
create policy "admin le atribuicoes" on public.vendas_atribuicoes for select to authenticated using ((select privado.eh_admin()));
create policy "admin le eventos" on public.hubla_eventos for select to authenticated using ((select privado.eh_admin()));

create policy "admin le custos" on public.custos_fixos for select to authenticated using ((select privado.eh_admin()));
create policy "admin cria custo" on public.custos_fixos for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita custo" on public.custos_fixos for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "admin le valores de custo" on public.custos_fixos_valores for select to authenticated using ((select privado.eh_admin()));
create policy "admin cria valor de custo" on public.custos_fixos_valores for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita valor de custo" on public.custos_fixos_valores for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "admin le meses" on public.vendas_meses for select to authenticated using ((select privado.eh_admin()));
create policy "admin cria mes" on public.vendas_meses for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita mes" on public.vendas_meses for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
