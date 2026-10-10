-- Módulo Webinários (v1, sem integração). Contexto em docs/modulos/webinarios.md.
--   - cadastro de cada webinário (tipo, oferta, preço, frequência, horário, status; plataforma e
--     ID da oferta na Hubla opcionais, para preencher quando definir);
--   - checklist de implantação = tarefas da aba Tarefas ligadas ao webinário, criadas a partir de
--     um modelo fixo que o admin ajusta (responsável sai da equipe);
--   - sessões com métricas digitadas (funil da live) e mensagens digitadas (custo estimado);
--   - biblioteca de links por webinário (roteiro, copy, script, criativo, playbook…).
-- Acesso: admin vê e edita tudo. Vendedor vê só o checklist e o playbook dos webinários "no ar"
-- (pela função public.webinarios_no_ar(), que devolve só isso).

-- ---------------------------------------------------------------------------
-- Webinários
-- ---------------------------------------------------------------------------
create table public.webinarios (
  id               bigint generated always as identity primary key,
  nome             text not null unique check (length(trim(nome)) between 2 and 80),
  tipo             text not null check (tipo in ('downsell', 'ascensao')),  -- downsell: quem não comprou; ascensão: quem comprou
  oferta           text check (oferta is null or length(trim(oferta)) <= 120),
  preco            numeric(10, 2) check (preco is null or preco > 0),
  frequencia       text check (frequencia is null or length(frequencia) <= 80),   -- ex.: "toda terça"
  horario          text check (horario is null or length(horario) <= 40),         -- ex.: "20h"
  plataforma       text check (plataforma is null or length(plataforma) <= 60),   -- opcional (ainda não definida)
  hubla_oferta_id  text check (hubla_oferta_id is null or length(hubla_oferta_id) <= 80), -- opcional
  status           text not null default 'planejando' check (status in ('planejando', 'gravando', 'no_ar', 'pausado')),
  criado_por       uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create index webinarios_criado_por_idx on public.webinarios (criado_por);

-- ---------------------------------------------------------------------------
-- Modelo do checklist (fixo, o admin ajusta). Ao criar o checklist de um webinário, cada item
-- vira uma tarefa ligada a ele.
-- ---------------------------------------------------------------------------
create table public.webinario_checklist_modelo (
  id         bigint generated always as identity primary key,
  ordem      integer not null default 0,
  titulo     text not null unique check (length(trim(titulo)) between 2 and 120),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

insert into public.webinario_checklist_modelo (ordem, titulo) values
  (1,  'Roteiro do webinário'),
  (2,  'Gravação'),
  (3,  'Scripts do grupo'),
  (4,  'Vídeos e áudios de aquecimento'),
  (5,  'Vídeos e áudios de recuperação'),
  (6,  'Template aprovado na Meta: convite'),
  (7,  'Template aprovado na Meta: "estou ao vivo"'),
  (8,  'Template aprovado na Meta: recuperação'),
  (9,  'Automações na Data Crazy'),
  (10, 'Webhook da plataforma de webinar'),
  (11, 'Playbook de objeções para o comercial');

-- tarefa do checklist: ligada a UM webinário (e a nenhuma BM/número)
alter table public.tarefas
  add column webinario_id bigint references public.webinarios (id);

alter table public.tarefas drop constraint tarefas_um_vinculo;
alter table public.tarefas
  add constraint tarefas_um_vinculo check (num_nonnulls(bm_id, numero_id, webinario_id) <= 1);

create index tarefas_webinario_id_idx on public.tarefas (webinario_id);

-- ---------------------------------------------------------------------------
-- Sessões: métricas e mensagens digitadas (v1). Variação A/B e utm_content opcionais.
-- Custo estimado = mensagens por template × custo por mensagem (dentro da janela de 24h é grátis).
-- ---------------------------------------------------------------------------
create table public.webinario_sessoes (
  id                    bigint generated always as identity primary key,
  webinario_id          bigint not null references public.webinarios (id),
  dia                   date not null,
  variacao              text check (variacao is null or length(variacao) <= 40),     -- A/B, opcional (ex.: "preço 297")
  utm_content           text check (utm_content is null or length(utm_content) <= 80), -- opcional (identifica a venda depois)
  convidados            integer check (convidados >= 0),
  entraram_grupo        integer check (entraram_grupo >= 0),
  entraram_live         integer check (entraram_live >= 0),
  chegaram_pitch        integer check (chegaram_pitch >= 0),
  clicaram_oferta       integer check (clicaram_oferta >= 0),
  compraram             integer check (compraram >= 0),
  recuperados_quente    integer check (recuperados_quente >= 0),
  recuperados_morno     integer check (recuperados_morno >= 0),
  -- mensagens: por template (paga) e dentro da janela de 24h (grátis)
  convite_template      integer check (convite_template >= 0),
  convite_janela        integer check (convite_janela >= 0),
  ao_vivo_template      integer check (ao_vivo_template >= 0),
  ao_vivo_janela        integer check (ao_vivo_janela >= 0),
  recuperacao_template  integer check (recuperacao_template >= 0),
  recuperacao_janela    integer check (recuperacao_janela >= 0),
  observacoes           text check (observacoes is null or length(observacoes) <= 1000),
  criado_por            uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em             timestamptz not null default now(),
  constraint webinario_sessoes_uma_por_dia unique nulls not distinct (webinario_id, dia, variacao)
);

create index webinario_sessoes_webinario_dia_idx on public.webinario_sessoes (webinario_id, dia);
create index webinario_sessoes_criado_por_idx on public.webinario_sessoes (criado_por);

-- ---------------------------------------------------------------------------
-- Biblioteca: só links na v1
-- ---------------------------------------------------------------------------
create table public.webinario_links (
  id            bigint generated always as identity primary key,
  webinario_id  bigint not null references public.webinarios (id),
  tipo          text not null check (tipo in ('roteiro', 'copy', 'script', 'criativo', 'playbook', 'outro')),
  titulo        text not null check (length(trim(titulo)) between 2 and 120),
  url           text not null check (url ~ '^https?://' and length(url) <= 1000),
  criado_em     timestamptz not null default now()
);

create index webinario_links_webinario_id_idx on public.webinario_links (webinario_id);

-- ---------------------------------------------------------------------------
-- Configuração (uma linha): custo por mensagem de template (R$)
-- ---------------------------------------------------------------------------
create table public.webinarios_config (
  id               boolean primary key default true check (id),
  custo_mensagem   numeric(8, 4) not null default 0.035 check (custo_mensagem >= 0),
  atualizado_em    timestamptz not null default now()
);
insert into public.webinarios_config default values;

-- ---------------------------------------------------------------------------
-- Vendedor: checklist e playbook só dos webinários "no ar" (nada de preço, sessões ou métricas)
-- ---------------------------------------------------------------------------
create or replace function public.webinarios_no_ar()
returns table (webinario_id bigint, nome text, playbook_titulo text, playbook_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.nome, l.titulo, l.url
    from public.webinarios w
    left join public.webinario_links l on l.webinario_id = w.id and l.tipo = 'playbook'
   where w.status = 'no_ar'
   order by w.nome, l.titulo;
$$;

revoke execute on function public.webinarios_no_ar() from public, anon;
grant execute on function public.webinarios_no_ar() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: tudo só admin (o vendedor usa a função acima; as tarefas seguem as regras de Tarefas)
-- ---------------------------------------------------------------------------
alter table public.webinarios                 enable row level security;
alter table public.webinario_checklist_modelo enable row level security;
alter table public.webinario_sessoes          enable row level security;
alter table public.webinario_links            enable row level security;
alter table public.webinarios_config          enable row level security;

revoke all on public.webinarios, public.webinario_checklist_modelo, public.webinario_sessoes,
              public.webinario_links, public.webinarios_config from anon;
grant select, insert, update on public.webinarios, public.webinario_checklist_modelo,
                                public.webinario_sessoes, public.webinario_links to authenticated;
grant delete on public.webinario_links, public.webinario_sessoes to authenticated;
grant select, update on public.webinarios_config to authenticated;

create policy "admin le webinarios" on public.webinarios for select to authenticated using ((select privado.eh_admin()));
create policy "admin cria webinario" on public.webinarios for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita webinario" on public.webinarios for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "admin le modelo do checklist" on public.webinario_checklist_modelo for select to authenticated using ((select privado.eh_admin()));
create policy "admin cria item do modelo" on public.webinario_checklist_modelo for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita item do modelo" on public.webinario_checklist_modelo for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "admin le sessoes" on public.webinario_sessoes for select to authenticated using ((select privado.eh_admin()));
create policy "admin cria sessao" on public.webinario_sessoes for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita sessao" on public.webinario_sessoes for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
create policy "admin apaga sessao" on public.webinario_sessoes for delete to authenticated using ((select privado.eh_admin()));

create policy "admin le links" on public.webinario_links for select to authenticated using ((select privado.eh_admin()));
create policy "admin cria link" on public.webinario_links for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita link" on public.webinario_links for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
create policy "admin apaga link" on public.webinario_links for delete to authenticated using ((select privado.eh_admin()));

create policy "admin le config de webinarios" on public.webinarios_config for select to authenticated using ((select privado.eh_admin()));
create policy "admin edita config de webinarios" on public.webinarios_config for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
