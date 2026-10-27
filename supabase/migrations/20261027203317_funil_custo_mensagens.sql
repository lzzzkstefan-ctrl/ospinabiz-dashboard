-- Funil: custo das mensagens do WhatsApp API oficial (pedido do Davi, 27/10/2026).
-- Contexto em docs/modulos/funil.md ("Custo de mensagens").
--
-- A Meta cobra cada mensagem ENVIADA pela empresa e entregue (a recebida do lead é grátis).
-- Grátis: as primeiras N por número no mês (franquia, padrão 1.000) e, para lead que chega por
-- anúncio Click-to-WhatsApp, a janela grátis de entrada (só quando a resposta sai em até 24 h).
--
-- O que entra:
--   1. funil_custo_config: preço por mensagem, franquia mensal, moeda e janela grátis (admin edita).
--   2. funil_etapas.grupo_custo: em que linha da tela de custo cada etapa entra.
--   3. Origem do lead: funil_conversas.origem ('ctwa' quando a Data Crazy traz o id do anúncio
--      Click-to-WhatsApp; senão 'link') e funil_leads.origem (ctwa se alguma conversa for ctwa).
--      funil_leads.comprou_em: momento da compra (1ª etiqueta de Aluno ou pagamento na Hubla).
--   4. funil_mensagens_enviadas: uma linha por mensagem enviada (SÓ metadados, nunca o texto).
--   5. funil_meta_custo_dia: custo real por dia que a Meta informa (pricing analytics da WABA).
--   6. funil_custo_recalcular(): etapa no momento do envio, se foi antes da compra e se foi grátis
--      (anúncio / franquia) ou cobrada. Roda no fim de cada sincronização.
--   7. Visões agregadas para a tela (só admin, pelo RLS das tabelas).
--
-- Gravação: só o servidor (sincronização, com a chave secreta). Leitura: só admin.
-- Nada é apagado: só colunas e tabelas novas.

-- ---------------------------------------------------------------------------
-- 1. Configuração (uma linha só)
-- ---------------------------------------------------------------------------
create table public.funil_custo_config (
  id                   boolean primary key default true check (id),
  preco_mensagem       numeric(10, 4) not null default 0.035 check (preco_mensagem >= 0 and preco_mensagem < 100),
  franquia_mensal      integer not null default 1000 check (franquia_mensal between 0 and 1000000),
  moeda                text not null default 'BRL' check (moeda ~ '^[A-Z]{3}$'),
  -- janela grátis de entrada (só lead de anúncio Click-to-WhatsApp)
  janela_gratis_horas  integer not null default 72 check (janela_gratis_horas between 0 and 720),
  atualizado_por       uuid references auth.users (id) on delete set null default auth.uid(),
  atualizado_em        timestamptz not null default now()
);
insert into public.funil_custo_config default values;

create index funil_custo_config_atualizado_por_idx on public.funil_custo_config (atualizado_por);

-- ---------------------------------------------------------------------------
-- 2. Etapa → linha da tela de custo
-- ---------------------------------------------------------------------------
alter table public.funil_etapas
  add column grupo_custo text check (grupo_custo in ('perguntas', 'parte1', 'parte2', 'sem_dinheiro', 'pagamento', 'comprou'));

comment on column public.funil_etapas.grupo_custo is
  'Linha da tela "Custo de mensagens" (perguntas, parte1, parte2, sem_dinheiro, pagamento, comprou). Vazio = a etiqueta não muda a etapa do custo.';

-- valor inicial pela estrutura do funil (ordem e tipo), sem nome de etiqueta
update public.funil_etapas e
set grupo_custo = case
  when e.comprou then 'comprou'
  when e.tipo in ('objecao', 'downsell') then 'sem_dinheiro'
  when e.tipo = 'etapa' and e.ordem = 1 then 'perguntas'
  when e.tipo = 'etapa' and e.ordem = 2 then 'parte1'
  when e.tipo = 'etapa' and e.ordem in (3, 4) then 'parte2'
  when e.tipo = 'etapa' and e.ordem between 5 and 7 then 'pagamento'
end
where e.tipo in ('etapa', 'objecao', 'downsell');

-- perda (frustrado) fica na etapa em que o lead parou
update public.funil_etapas p
set grupo_custo = e.grupo_custo
from public.funil_etapas e
where p.tipo = 'perda' and p.perda_na_etapa_id = e.id;

grant update (grupo_custo) on public.funil_etapas to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Origem do lead e momento da compra
-- ---------------------------------------------------------------------------
alter table public.funil_conversas
  add column criada_em            timestamptz,
  add column origem               text not null default 'link' check (origem in ('link', 'ctwa')),
  -- última "última mensagem enviada" (lastSendedMessageDate) cujas mensagens já foram lidas
  add column mensagens_lidas_ate  timestamptz;

alter table public.funil_leads
  add column origem      text not null default 'link' check (origem in ('link', 'ctwa')),
  add column comprou_em  timestamptz;

alter table public.funil_numeros
  -- conta do WhatsApp (WABA) do número na Meta: id público, serve para puxar o custo real
  add column waba_id text;

-- ---------------------------------------------------------------------------
-- 4. Mensagens enviadas (sem o texto)
--   tipo     → texto, audio, video, imagem, documento, template (com botões/cabeçalho), outro
--   origem   → automacao (fluxo da Data Crazy), atendente (pessoa no CRM), celular (sem nenhum dos dois:
--              envio pelo app do WhatsApp no celular, na coexistência)
--   entrega  → entregue (entregue ou lida), enviada (ainda não entregue), erro
--   cobranca → gratis_anuncio, franquia, cobrada, nao_cobrada (não entregue)
-- lead_dc_id, numero e interno vêm da conversa (recalculados: o lead "contato:" vira lead de verdade).
-- ---------------------------------------------------------------------------
create table public.funil_mensagens_enviadas (
  dc_id            text primary key,
  conversa_dc_id   text not null,
  lead_dc_id       text,
  numero_dc_id     text,
  enviada_em       timestamptz not null,
  tipo             text not null check (tipo in ('texto', 'audio', 'video', 'imagem', 'documento', 'template', 'outro')),
  origem           text not null check (origem in ('automacao', 'atendente', 'celular')),
  atendente_dc_id  text,
  fluxo            text,
  entrega          text not null check (entrega in ('entregue', 'enviada', 'erro')),
  etapa_custo      text check (etapa_custo in ('sem_etapa', 'perguntas', 'parte1', 'parte2', 'sem_dinheiro', 'pagamento', 'comprou')),
  antes_da_compra  boolean,
  cobranca         text check (cobranca in ('gratis_anuncio', 'franquia', 'cobrada', 'nao_cobrada')),
  interno          boolean not null default false,
  lida_em          timestamptz not null default now(),
  calculada_em     timestamptz
);

create index funil_mensagens_enviadas_enviada_em_idx on public.funil_mensagens_enviadas (enviada_em);
create index funil_mensagens_enviadas_conversa_idx on public.funil_mensagens_enviadas (conversa_dc_id, enviada_em);
create index funil_mensagens_enviadas_lead_idx on public.funil_mensagens_enviadas (lead_dc_id, enviada_em);

-- ---------------------------------------------------------------------------
-- 5. Custo real da Meta por dia (pricing analytics da WABA)
--   tipo      → pricing_type da Meta (REGULAR, FREE_CUSTOMER_SERVICE, FREE_ENTRY_POINT...)
--   categoria → pricing_category (MARKETING, UTILITY, SERVICE, AUTHENTICATION...)
-- ---------------------------------------------------------------------------
create table public.funil_meta_custo_dia (
  dia            date not null,
  waba_id        text not null,
  tipo           text not null,
  categoria      text not null,
  mensagens      integer not null default 0,
  custo          numeric(14, 4) not null default 0,
  moeda          text,
  atualizado_em  timestamptz not null default now(),
  primary key (dia, waba_id, tipo, categoria)
);

-- ---------------------------------------------------------------------------
-- 6. Recalcular etapa, compra e cobrança
-- Recalcula a partir do 1º dia do mês (UTC, como a Meta) de p_desde, porque a franquia conta na
-- ordem de envio desde o começo do mês. Só grava o que mudou.
-- ---------------------------------------------------------------------------
create or replace function public.funil_custo_recalcular(p_desde timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio  timestamptz := date_trunc('month', p_desde at time zone 'UTC') at time zone 'UTC';
  v_cfg     public.funil_custo_config;
  v_total   integer;
begin
  select * into v_cfg from public.funil_custo_config where id;

  -- conversa → lead e interno (o lead "contato:" vira lead de verdade depois)
  update public.funil_mensagens_enviadas m
     set lead_dc_id = c.lead_dc_id, interno = c.interno
    from public.funil_conversas c
   where c.dc_id = m.conversa_dc_id
     and m.enviada_em >= v_inicio
     and (m.lead_dc_id is distinct from c.lead_dc_id or m.interno is distinct from c.interno);

  -- origem do lead: ctwa se alguma conversa dele veio de anúncio Click-to-WhatsApp
  update public.funil_leads l
     set origem = x.origem
    from (
      select c.lead_dc_id, case when bool_or(c.origem = 'ctwa') then 'ctwa' else 'link' end as origem
        from public.funil_conversas c
       where c.lead_dc_id is not null
       group by c.lead_dc_id
    ) x
   where x.lead_dc_id = l.dc_id and l.origem is distinct from x.origem;

  -- momento da compra: o que vier primeiro entre a 1ª etiqueta de etapa "comprou" e o pagamento da venda
  update public.funil_leads l
     set comprou_em = x.em
    from (
      select l2.dc_id,
             least(
               (select min(e.em)
                  from public.funil_eventos e
                  join public.funil_etiquetas t on t.dc_id = e.etiqueta_dc_id
                  join public.funil_etapas s on s.id = t.etapa_id
                 where e.lead_dc_id = l2.dc_id and e.acao = 'colocou' and s.comprou),
               (select coalesce(v.pago_em, (v.data::timestamp + time '12:00') at time zone 'America/Sao_Paulo')
                  from public.vendas v where v.id = l2.venda_id)
             ) as em
        from public.funil_leads l2
       where l2.compra in ('hubla', 'fora_hubla')
    ) x
   where x.dc_id = l.dc_id and l.comprou_em is distinct from x.em;

  update public.funil_leads
     set comprou_em = null
   where comprou_em is not null and (compra is null or compra = 'a_conferir');

  -- etapa no momento do envio: a última etiqueta com grupo de custo colocada até ali;
  -- depois da compra, "comprou"
  with calc as (
    select m.dc_id,
           case
             when l.comprou_em is not null and m.enviada_em >= l.comprou_em then 'comprou'
             else coalesce((
               select s.grupo_custo
                 from public.funil_eventos e
                 join public.funil_etiquetas t on t.dc_id = e.etiqueta_dc_id
                 join public.funil_etapas s on s.id = t.etapa_id
                where e.lead_dc_id = m.lead_dc_id
                  and e.acao = 'colocou'
                  and e.em <= m.enviada_em
                  and s.grupo_custo is not null
                order by e.em desc
                limit 1
             ), 'sem_etapa')
           end as etapa,
           case when l.comprou_em is null then null else m.enviada_em < l.comprou_em end as antes
      from public.funil_mensagens_enviadas m
      left join public.funil_leads l on l.dc_id = m.lead_dc_id
     where m.enviada_em >= v_inicio
  )
  update public.funil_mensagens_enviadas m
     set etapa_custo = calc.etapa, antes_da_compra = calc.antes
    from calc
   where calc.dc_id = m.dc_id
     and (m.etapa_custo is distinct from calc.etapa or m.antes_da_compra is distinct from calc.antes);

  -- cobrança: não entregue = não cobrada; janela grátis de anúncio; franquia por número e mês
  -- (na ordem de envio); o resto, cobrada
  with base as (
    select m.dc_id, m.entrega, m.enviada_em, m.numero_dc_id, c.origem, c.criada_em,
           min(m.enviada_em) over (partition by m.conversa_dc_id) as primeira_enviada
      from public.funil_mensagens_enviadas m
      left join public.funil_conversas c on c.dc_id = m.conversa_dc_id
     where m.enviada_em >= v_inicio
  ),
  gratis as (
    select b.*,
           coalesce(b.origem = 'ctwa'
             and b.criada_em is not null
             and b.primeira_enviada <= b.criada_em + interval '24 hours'
             and b.enviada_em < b.primeira_enviada + make_interval(hours => v_cfg.janela_gratis_horas), false) as anuncio
      from base b
  ),
  ordem as (
    select g.dc_id, g.entrega, g.anuncio,
           row_number() over (
             partition by g.numero_dc_id, date_trunc('month', g.enviada_em at time zone 'UTC'), (g.entrega = 'entregue' and not g.anuncio)
             order by g.enviada_em, g.dc_id
           ) as n
      from gratis g
  ),
  final as (
    select o.dc_id,
           case
             when o.entrega <> 'entregue' then 'nao_cobrada'
             when o.anuncio then 'gratis_anuncio'
             when o.n <= v_cfg.franquia_mensal then 'franquia'
             else 'cobrada'
           end as cobranca
      from ordem o
  )
  update public.funil_mensagens_enviadas m
     set cobranca = f.cobranca, calculada_em = now()
    from final f
   where f.dc_id = m.dc_id and m.cobranca is distinct from f.cobranca;

  select count(*) into v_total from public.funil_mensagens_enviadas where enviada_em >= v_inicio;
  return v_total;
end;
$$;

revoke execute on function public.funil_custo_recalcular(timestamptz) from public, anon, authenticated;
grant execute on function public.funil_custo_recalcular(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Visões para a tela (security_invoker: valem o RLS das tabelas = só admin)
-- ---------------------------------------------------------------------------
-- Mensagens agrupadas por dia (Brasília), lead, número, etapa, cobrança, origem e tipo.
create view public.funil_custo_resumo with (security_invoker = true) as
select (m.enviada_em at time zone 'America/Sao_Paulo')::date as dia,
       m.lead_dc_id,
       m.numero_dc_id,
       coalesce(m.etapa_custo, 'sem_etapa') as etapa_custo,
       coalesce(m.cobranca, 'nao_cobrada') as cobranca,
       m.origem,
       m.tipo,
       m.antes_da_compra,
       m.interno,
       count(*)::integer as mensagens,
       (count(*) filter (where m.entrega = 'entregue'))::integer as entregues
  from public.funil_mensagens_enviadas m
 group by 1, 2, 3, 4, 5, 6, 7, 8, 9;

-- Franquia por número e mês (UTC): quantas contaram e quando a primeira foi cobrada
create view public.funil_custo_franquia with (security_invoker = true) as
select (date_trunc('month', m.enviada_em at time zone 'UTC'))::date as mes,
       m.numero_dc_id,
       (count(*) filter (where m.cobranca in ('franquia', 'cobrada')))::integer as contadas,
       min(m.enviada_em) filter (where m.cobranca = 'cobrada') as acabou_em
  from public.funil_mensagens_enviadas m
 group by 1, 2;

-- Por dia em UTC (o dia da Meta), para comparar o estimado com o custo real
create view public.funil_custo_dia_utc with (security_invoker = true) as
select (m.enviada_em at time zone 'UTC')::date as dia,
       coalesce(m.cobranca, 'nao_cobrada') as cobranca,
       count(*)::integer as mensagens
  from public.funil_mensagens_enviadas m
 group by 1, 2;

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------
alter table public.funil_custo_config        enable row level security;
alter table public.funil_mensagens_enviadas  enable row level security;
alter table public.funil_meta_custo_dia      enable row level security;

revoke all on public.funil_custo_config, public.funil_mensagens_enviadas, public.funil_meta_custo_dia,
              public.funil_custo_resumo, public.funil_custo_franquia, public.funil_custo_dia_utc from anon;
grant select on public.funil_custo_config, public.funil_mensagens_enviadas, public.funil_meta_custo_dia,
                public.funil_custo_resumo, public.funil_custo_franquia, public.funil_custo_dia_utc to authenticated;
grant update (preco_mensagem, franquia_mensal, moeda, janela_gratis_horas, atualizado_por, atualizado_em)
  on public.funil_custo_config to authenticated;

create policy "admin le custo config" on public.funil_custo_config
  for select to authenticated using ((select privado.eh_admin()));
create policy "admin edita custo config" on public.funil_custo_config
  for update to authenticated using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

create policy "admin le mensagens enviadas" on public.funil_mensagens_enviadas
  for select to authenticated using ((select privado.eh_admin()));

create policy "admin le custo da meta" on public.funil_meta_custo_dia
  for select to authenticated using ((select privado.eh_admin()));
