-- Central de gestão · Fase 3 (21/11/2026): Frentes e Funis.
-- Só a gestão (privado.eh_gestao(), da fase 2). Contexto em docs/modulos/gestao.md.
-- Números com `*_origem` ('manual' | 'prime'): digitados até a integração com o Prime.
-- Os nomes `mapa_*` evitam confusão com as tabelas antigas `funil_*` (Data Crazy, arquivadas).

-- ---------------------------------------------------------------------------
-- 1) frentes: a página de cada frente
-- ---------------------------------------------------------------------------
alter table public.frentes
  add column objetivo     text check (length(objetivo) <= 500),
  add column meta_mensal  numeric(12, 2) check (meta_mensal >= 0),
  add column publico      text check (length(publico) <= 1000),
  add column canal        text check (length(canal) <= 1000),
  add column estrategia   text check (length(estrategia) <= 4000),
  add column notas        text check (length(notas) <= 20000),
  -- de onde vêm os números reais da frente na tabela vendas (vendas.linha); vazio = sem vendas ainda
  add column linha_vendas text check (linha_vendas in ('gcs', 'viral'));

-- escada de ofertas de cada frente (a fase 4 usa a mesma tabela, com a conversão de cada degrau)
create table public.ofertas (
  id                bigint generated always as identity primary key,
  frente_id         bigint not null references public.frentes (id) on delete cascade,
  ordem             integer not null default 0,
  tipo              text not null default 'front' check (tipo in ('front', 'downsell', 'upsell', 'order_bump')),
  nome              text not null check (length(nome) between 1 and 120),
  preco             numeric(10, 2) check (preco >= 0),
  preco_ate         numeric(10, 2) check (preco_ate >= preco), -- faixa de preço (ex.: R$ 48,90 a R$ 118)
  condicao          text check (length(condicao) <= 300),      -- quando entra (ex.: conforme o valor que o lead tem)
  conversao         numeric(5, 2) check (conversao between 0 and 100), -- % (fase 4)
  conversao_origem  text not null default 'manual' check (conversao_origem in ('manual', 'prime')),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index ofertas_frente_idx on public.ofertas (frente_id, ordem);

create table public.frente_influencers (
  id            bigint generated always as identity primary key,
  frente_id     bigint not null references public.frentes (id) on delete cascade,
  nome          text not null check (length(nome) between 1 and 120),
  arroba        text check (length(arroba) <= 80),
  nicho         text check (length(nicho) <= 120),
  seguidores    integer check (seguidores >= 0),
  contato       text check (length(contato) <= 200),
  custo         numeric(12, 2) check (custo >= 0),
  remuneracao   text check (remuneracao in ('fixo', 'comissao', 'cupom')),
  link          text check (link ~ '^https?://' and length(link) <= 2000),
  cupom         text check (length(cupom) <= 60),
  vendas        integer check (vendas >= 0),
  vendas_origem text not null default 'manual' check (vendas_origem in ('manual', 'prime')),
  notas         text check (length(notas) <= 2000),
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index frente_influencers_frente_idx on public.frente_influencers (frente_id, ordem);

-- ---------------------------------------------------------------------------
-- 2) funis desenhados (canvas): mapas, blocos e ligações
-- ---------------------------------------------------------------------------
create table public.mapas (
  id            bigint generated always as identity primary key,
  slug          text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  nome          text not null check (length(nome) between 1 and 80),
  frente_id     bigint references public.frentes (id) on delete set null, -- vazio = visão geral
  figma_url     text check (figma_url ~ '^https://([a-z0-9-]+\.)?figma\.com/' and length(figma_url) <= 2000),
  viewport      jsonb, -- {x, y, zoom} da última vez
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index mapas_frente_idx on public.mapas (frente_id);

create table public.mapa_blocos (
  id            bigint generated always as identity primary key,
  mapa_id       bigint not null references public.mapas (id) on delete cascade,
  nome          text not null check (length(nome) between 1 and 80),
  tipo          text not null default 'mensagem' check (tipo in (
                  'entrada', 'anuncio', 'mensagem', 'audio', 'video', 'pagina', 'checkout', 'oferta',
                  'grupo', 'live', 'upsell', 'downsell', 'resultado', 'funil')),
  status        text not null default 'ideia' check (status in ('no_ar', 'construcao', 'ideia', 'problema')),
  preco         numeric(10, 2) check (preco >= 0),
  preco_ate     numeric(10, 2) check (preco_ate >= preco),
  numero        integer check (numero >= 0),          -- número da etapa (ex.: quantos chegaram)
  numero_origem text not null default 'manual' check (numero_origem in ('manual', 'prime')),
  nota          text check (length(nota) <= 4000),    -- o gancho do bloco, roteiro curto...
  links         jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'), -- [{titulo, url}]
  abre_mapa_id  bigint references public.mapas (id) on delete set null, -- na visão geral: o funil que esse bloco abre
  pos_x         double precision not null default 0,
  pos_y         double precision not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (mapa_id, id) -- para a ligação só juntar blocos do mesmo funil
);
create index mapa_blocos_mapa_idx on public.mapa_blocos (mapa_id);
create index mapa_blocos_abre_idx on public.mapa_blocos (abre_mapa_id);

create table public.mapa_ligacoes (
  id            bigint generated always as identity primary key,
  mapa_id       bigint not null references public.mapas (id) on delete cascade,
  de_bloco_id   bigint not null,
  para_bloco_id bigint not null,
  rotulo        text check (length(rotulo) <= 60), -- ex.: "não comprou", "sem dinheiro"
  criado_em     timestamptz not null default now(),
  foreign key (mapa_id, de_bloco_id) references public.mapa_blocos (mapa_id, id) on delete cascade,
  foreign key (mapa_id, para_bloco_id) references public.mapa_blocos (mapa_id, id) on delete cascade,
  check (de_bloco_id <> para_bloco_id),
  unique (de_bloco_id, para_bloco_id)
);
create index mapa_ligacoes_mapa_idx on public.mapa_ligacoes (mapa_id);
create index mapa_ligacoes_de_idx on public.mapa_ligacoes (mapa_id, de_bloco_id);
create index mapa_ligacoes_para_idx on public.mapa_ligacoes (mapa_id, para_bloco_id);

-- ---------------------------------------------------------------------------
-- 3) atualizado_em, RLS (só gestão) e permissões
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ofertas', 'frente_influencers', 'mapas', 'mapa_blocos'] loop
    execute format('create trigger gestao_atualizado_em before update on public.%I for each row execute function privado.gestao_atualizado_em()', t);
  end loop;
  foreach t in array array['ofertas', 'frente_influencers', 'mapas', 'mapa_blocos', 'mapa_ligacoes'] loop
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

-- ---------------------------------------------------------------------------
-- 4) dados iniciais (do pedido de 21/11/2026; o que não foi dito fica vazio)
-- ---------------------------------------------------------------------------
update public.frentes set
  canal = 'Tráfego pago Meta → WhatsApp (Prime)',
  estrategia = 'Tráfego pago Meta → WhatsApp (Prime) → Perguntas iniciais → Parte 1 e Parte 2 em blocos com ganchos → front R$ 338 → downsell R$ 278 / 238 / 158 conforme o valor que o lead tem.',
  linha_vendas = 'gcs'
where slug = 'x1-gcs';

update public.frentes set
  canal = 'Tráfego de influencers: link do influencer → página/checkout do Viral',
  estrategia = 'O Protocolo Viral saiu do X1. Hipótese: vender direto por tráfego de influencers (link do influencer → página/checkout do Viral, de R$ 48,90 a R$ 118) e depois subir o comprador para o GCS.',
  linha_vendas = 'viral'
where slug = 'viral-influencers';

update public.frentes set
  publico = 'Quem não comprou no X1',
  canal = 'Convite no WhatsApp → grupo',
  estrategia = 'Para quem não comprou no X1 → convite no WhatsApp → grupo → live → oferta → recuperação pós-webinar. Planejando com o Julio.'
where slug = 'webinarios';

insert into public.ofertas (frente_id, ordem, tipo, nome, preco, preco_ate, condicao)
select f.id, v.ordem, v.tipo, v.nome, v.preco, v.preco_ate, v.condicao
  from (values
    ('x1-gcs', 1, 'front', 'GCS · front', 338::numeric, null::numeric, null::text),
    ('x1-gcs', 2, 'downsell', 'GCS · downsell', 278, null, 'conforme o valor que o lead tem'),
    ('x1-gcs', 3, 'downsell', 'GCS · downsell', 238, null, 'conforme o valor que o lead tem'),
    ('x1-gcs', 4, 'downsell', 'GCS · downsell', 158, null, 'conforme o valor que o lead tem'),
    ('viral-influencers', 1, 'front', 'Protocolo Viral', 48.90, 118, null),
    ('viral-influencers', 2, 'upsell', 'GCS', null, null, 'depois da compra do Viral')
  ) as v (slug, ordem, tipo, nome, preco, preco_ate, condicao)
  join public.frentes f on f.slug = v.slug;

insert into public.mapas (slug, nome, frente_id, ordem)
select v.slug, v.nome, f.id, v.ordem
  from (values
    ('geral', 'Visão geral (empilhamento)', null::text, 0),
    ('x1-gcs', 'X1 · GCS', 'x1-gcs', 1),
    ('viral-influencers', 'Viral via Influencers', 'viral-influencers', 2),
    ('webinarios', 'Webinários', 'webinarios', 3),
    ('lancamento', 'Lançamento', 'lancamento', 4)
  ) as v (slug, nome, frente, ordem)
  left join public.frentes f on f.slug = v.frente;

-- blocos: (mapa, chave, nome, tipo, status, preco, preco_ate, abre, x, y). A chave só serve para ligar abaixo.
create temporary table blocos_iniciais (mapa text, chave text, nome text, tipo text, status text, preco numeric, preco_ate numeric, abre text, x double precision, y double precision);
insert into blocos_iniciais values
  -- visão geral: como os funis se empilham
  ('geral', 'x1', 'X1 · GCS', 'funil', 'no_ar', null, null, 'x1-gcs', 0, 0),
  ('geral', 'web', 'Webinário', 'funil', 'construcao', null, null, 'webinarios', 320, 0),
  ('geral', 'rmk', 'Remarketing', 'mensagem', 'ideia', null, null, null, 640, 0),
  ('geral', 'inf', 'Influencers', 'anuncio', 'ideia', null, null, null, 0, 220),
  ('geral', 'vir', 'Viral', 'funil', 'ideia', null, null, 'viral-influencers', 320, 220),
  ('geral', 'gcs', 'GCS', 'resultado', 'no_ar', null, null, null, 640, 220),
  ('geral', 'lan', 'Lançamento', 'funil', 'ideia', null, null, 'lancamento', 320, 440),
  -- X1 · GCS (o funil atual)
  ('x1-gcs', 'chegou', 'Chegou', 'entrada', 'no_ar', null, null, null, 0, 0),
  ('x1-gcs', 'perg', 'Perguntas iniciais', 'mensagem', 'no_ar', null, null, null, 260, 0),
  ('x1-gcs', 'p1a', 'P1 · A', 'mensagem', 'no_ar', null, null, null, 520, 0),
  ('x1-gcs', 'p1b', 'P1 · B', 'mensagem', 'no_ar', null, null, null, 780, 0),
  ('x1-gcs', 'p1c', 'P1 · C', 'mensagem', 'no_ar', null, null, null, 1040, 0),
  ('x1-gcs', 'p2a', 'P2 · A', 'mensagem', 'no_ar', null, null, null, 1040, 200),
  ('x1-gcs', 'p2b', 'P2 · B', 'mensagem', 'no_ar', null, null, null, 780, 200),
  ('x1-gcs', 'p2c', 'P2 · C', 'oferta', 'no_ar', 338, null, null, 520, 200),
  ('x1-gcs', 'link', 'Link de pagamento', 'checkout', 'no_ar', null, null, null, 260, 200),
  ('x1-gcs', 'aluno', 'Aluno', 'resultado', 'no_ar', null, null, null, 0, 200),
  ('x1-gcs', 'down', 'Downsell 278 / 238 / 158', 'downsell', 'no_ar', 158, 278, null, 520, 400),
  -- Viral via Influencers (hipótese)
  ('viral-influencers', 'inf', 'Link do influencer', 'anuncio', 'ideia', null, null, null, 0, 0),
  ('viral-influencers', 'pag', 'Página / checkout do Viral', 'checkout', 'ideia', 48.90, 118, null, 260, 0),
  ('viral-influencers', 'up', 'Upsell para o GCS', 'upsell', 'ideia', null, null, null, 520, 0),
  -- Webinários (planejando)
  ('webinarios', 'conv', 'Convite no WhatsApp', 'mensagem', 'construcao', null, null, null, 0, 0),
  ('webinarios', 'grupo', 'Grupo', 'grupo', 'construcao', null, null, null, 260, 0),
  ('webinarios', 'live', 'Live', 'live', 'construcao', null, null, null, 520, 0),
  ('webinarios', 'oferta', 'Oferta', 'oferta', 'construcao', null, null, null, 780, 0),
  ('webinarios', 'recup', 'Recuperação pós-webinar', 'mensagem', 'construcao', null, null, null, 780, 200);

insert into public.mapa_blocos (mapa_id, nome, tipo, status, preco, preco_ate, pos_x, pos_y, abre_mapa_id)
select m.id, b.nome, b.tipo, b.status, b.preco, b.preco_ate, b.x, b.y, a.id
  from blocos_iniciais b
  join public.mapas m on m.slug = b.mapa
  left join public.mapas a on a.slug = b.abre;

-- o nome é único dentro de cada funil nos dados iniciais: liga a chave ao id criado
create temporary table blocos_ids as
select mb.id, mb.mapa_id, b.mapa, b.chave
  from blocos_iniciais b
  join public.mapas m on m.slug = b.mapa
  join public.mapa_blocos mb on mb.mapa_id = m.id and mb.nome = b.nome;

insert into public.mapa_ligacoes (mapa_id, de_bloco_id, para_bloco_id, rotulo)
select d.mapa_id, d.id, p.id, v.rotulo
  from (values
    ('geral', 'x1', 'web', 'não comprou'),
    ('geral', 'web', 'rmk', 'não comprou'),
    ('geral', 'inf', 'vir', null),
    ('geral', 'vir', 'gcs', 'upsell'),
    ('geral', 'lan', 'gcs', null),
    ('x1-gcs', 'chegou', 'perg', null),
    ('x1-gcs', 'perg', 'p1a', null),
    ('x1-gcs', 'p1a', 'p1b', null),
    ('x1-gcs', 'p1b', 'p1c', null),
    ('x1-gcs', 'p1c', 'p2a', null),
    ('x1-gcs', 'p2a', 'p2b', null),
    ('x1-gcs', 'p2b', 'p2c', null),
    ('x1-gcs', 'p2c', 'link', 'comprou'),
    ('x1-gcs', 'link', 'aluno', null),
    ('x1-gcs', 'p2c', 'down', 'sem dinheiro'),
    ('x1-gcs', 'down', 'link', null),
    ('viral-influencers', 'inf', 'pag', null),
    ('viral-influencers', 'pag', 'up', 'comprou'),
    ('webinarios', 'conv', 'grupo', null),
    ('webinarios', 'grupo', 'live', null),
    ('webinarios', 'live', 'oferta', null),
    ('webinarios', 'oferta', 'recup', 'não comprou')
  ) as v (mapa, de, para, rotulo)
  join blocos_ids d on d.mapa = v.mapa and d.chave = v.de
  join blocos_ids p on p.mapa = v.mapa and p.chave = v.para;

drop table blocos_ids;
drop table blocos_iniciais;
