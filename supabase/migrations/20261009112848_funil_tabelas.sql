-- Módulo Funil e Leads: leads da Data Crazy, etiqueta → etapa, eventos e sincronização.
-- Contexto em docs/modulos/funil.md.
--
-- Quem grava leads, eventos e sincronizações: só o servidor (/api/funil/sincronizar,
-- com a chave secreta, que ignora RLS).
-- Configuração (etapas, etiqueta → etapa, atendente → pessoa, número → monitor,
-- produtos de downsell): admin edita pela tela.
-- Nome e telefone do lead: tabela separada, só admin lê.
-- Leitura dos leads: admin vê tudo; vendedor vê só os leads atribuídos a ele.
--
-- Nenhum nome de etiqueta fica aqui: as etiquetas entram pela sincronização e o
-- admin liga cada uma a uma etapa. As etapas entram cadastradas (a estrutura do
-- funil), mas também são editáveis.
-- O job do pg_cron fica numa migration separada, depois que a rota existir.

-- ---------------------------------------------------------------------------
-- funil_etapas: a estrutura do funil.
--   etapa    → passo do funil, na ordem (1 = Perguntas iniciais ... 8 = Aluno)
--   perda    → o lead parou; perda_na_etapa_id = em que etapa ele estava
--   objecao  → ex.: Sem dinheiro
--   downsell → ofereceu produto mais barato (GSC ou Viral, pela venda na Hubla)
--   fora     → lead que não conta no funil (Menor de idade, Suporte, Lançamento)
-- Etiqueta sem etapa (etapa_id vazio) = ignorada (as "em revisão").
-- ---------------------------------------------------------------------------
create table public.funil_etapas (
  id                 bigint generated always as identity primary key,
  nome               text not null unique check (length(trim(nome)) between 1 and 60),
  tipo               text not null check (tipo in ('etapa', 'perda', 'objecao', 'downsell', 'fora')),
  ordem              integer unique,
  perda_na_etapa_id  bigint references public.funil_etapas (id),
  comprou            boolean not null default false,   -- etapa final (Aluno)
  ativa              boolean not null default true,
  criado_em          timestamptz not null default now(),
  constraint funil_etapas_ordem_so_em_etapa check ((tipo = 'etapa') = (ordem is not null)),
  constraint funil_etapas_perda_aponta_etapa check (perda_na_etapa_id is null or tipo = 'perda'),
  constraint funil_etapas_comprou_so_em_etapa check (not comprou or tipo = 'etapa')
);

create index funil_etapas_perda_na_etapa_id_idx on public.funil_etapas (perda_na_etapa_id);

insert into public.funil_etapas (nome, tipo, ordem, comprou) values
  ('Perguntas iniciais', 'etapa', 1, false),
  ('Parte 1',            'etapa', 2, false),
  ('Parte 2',            'etapa', 3, false),
  ('Esclarecido',        'etapa', 4, false),
  ('Eu quero',           'etapa', 5, false),
  ('Link de pagamento',  'etapa', 6, false),
  ('Vai pagar hoje',     'etapa', 7, false),
  ('Aluno',              'etapa', 8, true);

insert into public.funil_etapas (nome, tipo, perda_na_etapa_id)
select v.nome, 'perda', e.id
from (values
  ('Interação frustrado', 'Perguntas iniciais'),
  ('Parte 1 frustrado',   'Parte 1'),
  ('Parte 2 frustrado',   'Parte 2')
) as v (nome, etapa)
join public.funil_etapas e on e.nome = v.etapa;

insert into public.funil_etapas (nome, tipo) values
  ('Sem dinheiro',   'objecao'),
  ('Downsell',       'downsell'),
  ('Menor de idade', 'fora'),
  ('Suporte',        'fora'),
  ('Lançamento',     'fora');

-- ---------------------------------------------------------------------------
-- funil_etiquetas: as etiquetas da Data Crazy (dc_id = id lá) e a etapa de cada uma.
-- pagou_fora_hubla: a etiqueta marca compra fora da Hubla (Pix/CNPJ).
-- existe = false: a etiqueta sumiu da Data Crazy (não se apaga: eventos antigos apontam para ela).
-- ---------------------------------------------------------------------------
create table public.funil_etiquetas (
  dc_id             text primary key,
  nome              text not null,
  cor               text,
  etapa_id          bigint references public.funil_etapas (id),
  pagou_fora_hubla  boolean not null default false,
  existe            boolean not null default true,
  visto_em          timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index funil_etiquetas_etapa_id_idx on public.funil_etiquetas (etapa_id);

-- Todos os nomes que cada etiqueta já teve. O histórico da Data Crazy traz o
-- NOME da etiqueta (não o id); com esta tabela, um evento antigo com o nome
-- antigo ainda acha a etiqueta certa depois de uma renomeação.
create table public.funil_etiquetas_nomes (
  etiqueta_dc_id  text not null references public.funil_etiquetas (dc_id),
  nome            text not null,
  visto_em        timestamptz not null default now(),
  primary key (etiqueta_dc_id, nome)
);

create index funil_etiquetas_nomes_nome_idx on public.funil_etiquetas_nomes (nome);

-- ---------------------------------------------------------------------------
-- funil_atendentes: atendente da Data Crazy → pessoa da equipe (o admin liga).
-- funil_numeros: número (instância) da Data Crazy → número do Monitor (opcional).
-- ---------------------------------------------------------------------------
create table public.funil_atendentes (
  dc_id          text primary key,
  nome           text not null,
  equipe_id      bigint references public.equipe (id),
  visto_em       timestamptz not null default now()
);

create index funil_atendentes_equipe_id_idx on public.funil_atendentes (equipe_id);

create table public.funil_numeros (
  dc_id              text primary key,
  nome               text not null,
  monitor_numero_id  bigint references public.monitor_numeros (id),
  visto_em           timestamptz not null default now()
);

create index funil_numeros_monitor_numero_id_idx on public.funil_numeros (monitor_numero_id);

-- ---------------------------------------------------------------------------
-- funil_produtos_downsell: como reconhecer o downsell na venda da Hubla.
-- A venda é GSC ou Viral se algum item dela contiver o texto (sem diferenciar maiúscula).
-- ---------------------------------------------------------------------------
create table public.funil_produtos_downsell (
  id         bigint generated always as identity primary key,
  texto      text not null unique check (length(trim(texto)) between 2 and 80),
  tipo       text not null check (tipo in ('gsc', 'viral')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- funil_leads: um lead da Data Crazy (dc_id = id lá). Sem nome nem telefone.
--   dia                 → dia de entrada em Brasília (base do "leads por dia")
--   vendedor_id         → pessoa da equipe, vinda de funil_atendentes (atualiza sozinho
--                         quando o admin muda o vínculo; ver gatilho abaixo)
--   etiquetas_atuais    → ids das etiquetas na última leitura (serve para notar mudança)
--   historico_pendente  → a sincronização ainda precisa ler o histórico deste lead
--   compra              → 'hubla' (achou a venda), 'fora_hubla' (etiqueta Pix/CNPJ),
--                         'a_conferir' (etiqueta de Aluno sem venda achada)
-- ---------------------------------------------------------------------------
create table public.funil_leads (
  dc_id                text primary key,
  criado_em            timestamptz not null,
  dia                  date not null,
  atendente_dc_id      text references public.funil_atendentes (dc_id),
  vendedor_id          bigint references public.equipe (id),
  numero_dc_id         text references public.funil_numeros (dc_id),
  etiquetas_atuais     text[] not null default '{}',
  dc_atualizado_em     timestamptz,
  ultima_mensagem_em   timestamptz,
  historico_pendente   boolean not null default true,
  historico_lido_em    timestamptz,
  compra               text check (compra in ('hubla', 'fora_hubla', 'a_conferir')),
  venda_id             bigint references public.vendas (id) on delete set null,
  downsell             text check (downsell in ('gsc', 'viral')),
  sincronizado_em      timestamptz not null default now()
);

create index funil_leads_dia_idx on public.funil_leads (dia);
create index funil_leads_vendedor_id_idx on public.funil_leads (vendedor_id);
create index funil_leads_atendente_dc_id_idx on public.funil_leads (atendente_dc_id);
create index funil_leads_numero_dc_id_idx on public.funil_leads (numero_dc_id);
create index funil_leads_venda_id_idx on public.funil_leads (venda_id);
create index funil_leads_historico_pendente_idx on public.funil_leads (criado_em) where historico_pendente;

-- Dados pessoais do lead: só admin lê. O telefone (só dígitos) serve só para
-- cruzar com a venda da Hubla.
create table public.funil_leads_contato (
  lead_dc_id  text primary key references public.funil_leads (dc_id) on delete cascade,
  nome        text,
  telefone    text check (telefone ~ '^[0-9]{8,15}$')
);

create index funil_leads_contato_telefone_final_idx on public.funil_leads_contato (right(telefone, 8));

-- ---------------------------------------------------------------------------
-- funil_eventos: etiqueta colocada ou tirada de um lead, com a data.
--   origem 'historico'     → veio do histórico da Data Crazy (data exata)
--   origem 'sincronizacao' → a sincronização viu a etiqueta pela primeira vez
--                            (quando o histórico não trouxe o evento)
-- etiqueta_dc_id vazio = o nome do evento não bateu com nenhuma etiqueta conhecida.
-- ---------------------------------------------------------------------------
create table public.funil_eventos (
  id              bigint generated always as identity primary key,
  lead_dc_id      text not null references public.funil_leads (dc_id) on delete cascade,
  etiqueta_dc_id  text references public.funil_etiquetas (dc_id),
  etiqueta_nome   text not null,
  acao            text not null check (acao in ('colocou', 'tirou')),
  em              timestamptz not null,
  origem          text not null check (origem in ('historico', 'sincronizacao')),
  fluxo           text,             -- automação que colocou (sessionName); vazio = manual
  dc_evento_id    text unique,      -- id do evento na Data Crazy (vazio na origem 'sincronizacao')
  criado_em       timestamptz not null default now()
);

create index funil_eventos_lead_dc_id_idx on public.funil_eventos (lead_dc_id, em);
create index funil_eventos_etiqueta_dc_id_idx on public.funil_eventos (etiqueta_dc_id);

-- ---------------------------------------------------------------------------
-- funil_sincronizacoes: uma linha por rodada (a tela mostra a última e avisa se falhou).
-- ---------------------------------------------------------------------------
create table public.funil_sincronizacoes (
  id                bigint generated always as identity primary key,
  iniciada_em       timestamptz not null default now(),
  terminada_em      timestamptz,
  situacao          text not null default 'rodando' check (situacao in ('rodando', 'ok', 'falhou')),
  erro              text,
  chamadas          integer not null default 0,
  leads_lidos       integer not null default 0,
  historicos_lidos  integer not null default 0,
  pendentes         integer not null default 0
);

create index funil_sincronizacoes_iniciada_em_idx on public.funil_sincronizacoes (iniciada_em desc);

-- ---------------------------------------------------------------------------
-- Gatilho: quando o admin liga (ou troca) o atendente a uma pessoa da equipe,
-- os leads desse atendente passam a ser dessa pessoa na hora, sem esperar a
-- próxima sincronização.
-- ---------------------------------------------------------------------------
create or replace function privado.funil_atendente_propaga_vendedor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.funil_leads
     set vendedor_id = new.equipe_id
   where atendente_dc_id = new.dc_id
     and vendedor_id is distinct from new.equipe_id;
  return new;
end;
$$;

revoke execute on function privado.funil_atendente_propaga_vendedor() from public, anon, authenticated;

create trigger funil_atendente_propaga_vendedor
  after update of equipe_id on public.funil_atendentes
  for each row execute function privado.funil_atendente_propaga_vendedor();

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------
alter table public.funil_etapas            enable row level security;
alter table public.funil_etiquetas         enable row level security;
alter table public.funil_etiquetas_nomes   enable row level security;
alter table public.funil_atendentes        enable row level security;
alter table public.funil_numeros           enable row level security;
alter table public.funil_produtos_downsell enable row level security;
alter table public.funil_leads             enable row level security;
alter table public.funil_leads_contato     enable row level security;
alter table public.funil_eventos           enable row level security;
alter table public.funil_sincronizacoes    enable row level security;

revoke all on public.funil_etapas, public.funil_etiquetas, public.funil_etiquetas_nomes,
              public.funil_atendentes, public.funil_numeros, public.funil_produtos_downsell,
              public.funil_leads, public.funil_leads_contato, public.funil_eventos,
              public.funil_sincronizacoes from anon;

grant select on public.funil_etapas, public.funil_etiquetas, public.funil_etiquetas_nomes,
                public.funil_atendentes, public.funil_numeros, public.funil_produtos_downsell,
                public.funil_leads, public.funil_leads_contato, public.funil_eventos,
                public.funil_sincronizacoes to authenticated;

-- O que o admin edita pela tela (só estas colunas; o resto é da sincronização).
grant insert, update on public.funil_etapas, public.funil_produtos_downsell to authenticated;
grant update (etapa_id, pagou_fora_hubla) on public.funil_etiquetas to authenticated;
grant update (equipe_id) on public.funil_atendentes to authenticated;
grant update (monitor_numero_id) on public.funil_numeros to authenticated;

-- Configuração: todo logado lê (a tela monta o funil com ela); só admin edita.
create policy "logado le etapas" on public.funil_etapas for select to authenticated using (true);
create policy "admin cria etapa" on public.funil_etapas for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita etapa" on public.funil_etapas for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "logado le etiquetas" on public.funil_etiquetas for select to authenticated using (true);
create policy "admin liga etiqueta" on public.funil_etiquetas for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "logado le nomes de etiqueta" on public.funil_etiquetas_nomes for select to authenticated using (true);

create policy "logado le numeros" on public.funil_numeros for select to authenticated using (true);
create policy "admin liga numero" on public.funil_numeros for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "logado le produtos de downsell" on public.funil_produtos_downsell for select to authenticated using (true);
create policy "admin cria produto de downsell" on public.funil_produtos_downsell for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita produto de downsell" on public.funil_produtos_downsell for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- Atendentes: admin vê todos e liga à equipe; vendedor vê só o próprio.
create policy "le atendentes: admin todos, vendedor o proprio" on public.funil_atendentes
  for select to authenticated
  using ((select privado.eh_admin()) or equipe_id = (select privado.minha_equipe_id()));
create policy "admin liga atendente" on public.funil_atendentes for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- Leads e eventos: admin vê tudo; vendedor só os leads dele. Gravação só pelo servidor.
create policy "le leads: admin tudo, vendedor os proprios" on public.funil_leads
  for select to authenticated
  using ((select privado.eh_admin()) or vendedor_id = (select privado.minha_equipe_id()));

create policy "le eventos: admin tudo, vendedor dos proprios leads" on public.funil_eventos
  for select to authenticated
  using (
    (select privado.eh_admin())
    or lead_dc_id in (
      select l.dc_id from public.funil_leads l
      where l.vendedor_id = (select privado.minha_equipe_id())
    )
  );

-- Nome e telefone: só admin.
create policy "admin le contato do lead" on public.funil_leads_contato
  for select to authenticated using ((select privado.eh_admin()));

-- Sincronização: todo logado lê (a tela mostra a última rodada e o aviso de falha).
create policy "logado le sincronizacoes" on public.funil_sincronizacoes for select to authenticated using (true);
