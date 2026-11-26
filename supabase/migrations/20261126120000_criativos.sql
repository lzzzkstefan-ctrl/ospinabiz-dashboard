-- Criativos · Fase 1 (26/11/2026): produção de criativo em volume (meta: 10 novos por semana).
-- Só a gestão (app_metadata.gestao = true: Davi e Rodrigo), no mesmo padrão das tabelas de gestão
-- (privado.eh_gestao(), migration 20261121150000). Contexto em docs/modulos/criativos.md.
--
-- A IA (API da Anthropic) roda em app/api/criativos/gerar com o login de quem clicou: o RLS abaixo
-- vale também para o que ela grava. Nada de chave secreta do Supabase nesse caminho.

-- ---------------------------------------------------------------------------
-- criativos: o roteiro e onde ele está no funil de produção
-- ---------------------------------------------------------------------------
create table public.criativos (
  id                     bigint generated always as identity primary key,
  titulo                 text not null check (length(titulo) between 1 and 160),
  status                 text not null default 'ideia'
                           check (status in ('ideia', 'roteiro', 'gravar', 'gravado', 'no_ar', 'venceu', 'perdeu')),
  angulo                 text check (length(angulo) <= 300),
  formato                text check (length(formato) <= 300),
  duracao_seg            integer check (duracao_seg between 1 and 600),
  hook                   text check (length(hook) <= 1000),
  subhook                text check (length(subhook) <= 1000),
  corpo                  text check (length(corpo) <= 20000),
  cta                    text check (length(cta) <= 1000),
  roteiro_completo       text check (length(roteiro_completo) <= 30000),
  origem                 text not null default 'ideia_propria'
                           check (origem in ('ideia_propria', 'variacao', 'referencia', 'organico')),
  -- variação aponta para o campeão; apagar o campeão não apaga as variações (ficam soltas)
  pai_id                 bigint references public.criativos (id) on delete set null,
  referencia_link        text check (referencia_link ~ '^https?://' and length(referencia_link) <= 2000),
  referencia_transcricao text check (length(referencia_transcricao) <= 30000),
  resultado_notas        text check (length(resultado_notas) <= 4000),
  -- livre: custo por lead, conversas, vendas... (fase 2 pode puxar do Gerenciador)
  metricas               jsonb not null default '{}'::jsonb check (jsonb_typeof(metricas) = 'object'),
  criado_por             uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  check (pai_id is null or pai_id <> id)
);
create index criativos_status_idx on public.criativos (status, atualizado_em desc);
create index criativos_pai_idx on public.criativos (pai_id);
create index criativos_criado_por_idx on public.criativos (criado_por);

-- ---------------------------------------------------------------------------
-- criativo_geracoes: cada chamada à IA (histórico + controle de gasto do mês)
-- ---------------------------------------------------------------------------
create table public.criativo_geracoes (
  id                 bigint generated always as identity primary key,
  -- vazio = geração solta (ideias, análise de referência, separar campeão antes de salvar)
  criativo_id        bigint references public.criativos (id) on delete set null,
  modo               text not null
                       check (modo in ('variacoes', 'ideias', 'roteiro', 'organico', 'analise_referencia', 'separar')),
  entrada            text check (length(entrada) <= 60000),
  saida              jsonb,
  modelo             text not null check (length(modelo) <= 80),
  tokens_entrada     integer not null default 0 check (tokens_entrada >= 0),
  tokens_saida       integer not null default 0 check (tokens_saida >= 0),
  custo_estimado_brl numeric(10, 4) not null default 0 check (custo_estimado_brl >= 0),
  criado_por         uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em          timestamptz not null default now()
);
create index criativo_geracoes_criativo_idx on public.criativo_geracoes (criativo_id, criado_em desc);
create index criativo_geracoes_mes_idx on public.criativo_geracoes (criado_em);
create index criativo_geracoes_criado_por_idx on public.criativo_geracoes (criado_por);

-- ---------------------------------------------------------------------------
-- criativo_aprendizados: "memória da operação" (venceu/perdeu + motivo), que o agente lê
-- ---------------------------------------------------------------------------
create table public.criativo_aprendizados (
  id          bigint generated always as identity primary key,
  criativo_id bigint not null references public.criativos (id) on delete cascade,
  tipo        text not null check (tipo in ('venceu', 'perdeu')),
  motivo      text not null check (length(motivo) between 1 and 500),
  criado_em   timestamptz not null default now()
);
create index criativo_aprendizados_criativo_idx on public.criativo_aprendizados (criativo_id);
create index criativo_aprendizados_recentes_idx on public.criativo_aprendizados (criado_em desc);

-- atualizado_em sozinho (função da fase 2 da gestão)
create trigger gestao_atualizado_em before update on public.criativos
  for each row execute function privado.gestao_atualizado_em();

-- ---------------------------------------------------------------------------
-- RLS: a gestão lê e escreve tudo; anon nada
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['criativos', 'criativo_geracoes', 'criativo_aprendizados'] loop
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

-- o histórico de gerações é o que conta o gasto do mês: ninguém altera nem apaga pela tela
drop policy "gestao altera" on public.criativo_geracoes;
drop policy "gestao apaga" on public.criativo_geracoes;
revoke update, delete on public.criativo_geracoes from authenticated;
