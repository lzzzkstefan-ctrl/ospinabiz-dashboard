-- Funil: atendimento (decisões do Davi, 09/10/2026). Contexto em docs/modulos/funil.md.
--   1. Leads esperando resposta: a última mensagem do lead não teve resposta de um ATENDENTE DE
--      VERDADE (automação e suporte Data Crazy não contam) há mais de X horas DE ATENDIMENTO
--      (X e o horário editáveis pelo admin). Vale para lead antigo que voltou a falar: por isso
--      a base é a CONVERSA (funil_conversas), não o lead. A sincronização grava esperando_desde.
--   2. Tempo de primeira resposta: 1ª mensagem do lead → 1ª mensagem de um atendente de verdade
--      (sem automação e sem suporte Data Crazy). Lido uma vez por lead novo.
--   3. Conversão por número e por BM: funil_numeros.monitor_numero_id (já existia) → BM do Monitor.
--   4. Histórico de mudanças no funil: marcas com data e descrição nos gráficos.
--
-- Quem grava funil_conversas e as colunas de primeira resposta: só o servidor (sincronização).
-- Configuração e mudanças: admin do sistema (o Funil continua no "admin"; ver vendas_papeis).

-- ---------------------------------------------------------------------------
-- Configuração do Funil (uma linha só)
-- ---------------------------------------------------------------------------
create table public.funil_config (
  id                   boolean primary key default true check (id),
  horas_espera         numeric(4, 1) not null default 2 check (horas_espera > 0 and horas_espera <= 72),
  atendimento_inicio   time not null default '08:00',
  atendimento_fim      time not null default '22:00',
  atualizado_por       uuid references auth.users (id) on delete set null default auth.uid(),
  atualizado_em        timestamptz not null default now(),
  constraint funil_config_horario check (atendimento_fim > atendimento_inicio)
);
insert into public.funil_config default values;

create index funil_config_atualizado_por_idx on public.funil_config (atualizado_por);

-- ---------------------------------------------------------------------------
-- Conversas da Data Crazy (as com mensagem nos últimos 90 dias). Sem nome completo nem telefone:
-- só um rótulo "primeiro nome -1234" para o vendedor achar a conversa.
-- lead_dc_id vazio = lead fora da janela do funil (lead antigo que voltou a falar).
-- etiquetas_atuais = ids das etiquetas do contato agora (dão a etapa atual).
-- ---------------------------------------------------------------------------
create table public.funil_conversas (
  dc_id                  text primary key,
  lead_dc_id             text,
  contato_rotulo         text,
  numero_dc_id           text references public.funil_numeros (dc_id),
  atendente_dc_id        text references public.funil_atendentes (dc_id),
  vendedor_id            bigint references public.equipe (id),
  etiquetas_atuais       text[] not null default '{}',
  ultima_recebida_em     timestamptz,
  ultima_enviada_em      timestamptz,
  ultima_e_automacao     boolean not null default false,
  ultima_mensagem_em     timestamptz,
  -- hora da última mensagem do lead que ainda não teve resposta de atendente de verdade (vazio = respondida)
  esperando_desde        timestamptz,
  finalizada             boolean not null default false,
  sincronizado_em        timestamptz not null default now()
);

create index funil_conversas_lead_dc_id_idx on public.funil_conversas (lead_dc_id);
create index funil_conversas_numero_dc_id_idx on public.funil_conversas (numero_dc_id);
create index funil_conversas_atendente_dc_id_idx on public.funil_conversas (atendente_dc_id);
create index funil_conversas_vendedor_id_idx on public.funil_conversas (vendedor_id);
create index funil_conversas_esperando_idx on public.funil_conversas (esperando_desde) where esperando_desde is not null;

-- ---------------------------------------------------------------------------
-- Primeira resposta, por lead (da primeira conversa dele)
-- ---------------------------------------------------------------------------
alter table public.funil_leads
  add column primeira_msg_lead_em     timestamptz,
  add column primeira_resposta_em     timestamptz,
  add column primeira_resposta_por    text references public.funil_atendentes (dc_id),
  add column primeira_resposta_lida   boolean not null default false;

create index funil_leads_primeira_resposta_por_idx on public.funil_leads (primeira_resposta_por);
create index funil_leads_primeira_resposta_pendente_idx on public.funil_leads (criado_em) where not primeira_resposta_lida;

-- quando o admin marca um atendente como suporte, o gatilho já solta vendedor dos leads;
-- as conversas seguem a mesma regra
create or replace function privado.funil_atendente_propaga_vendedor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.suporte_dc then
    update public.funil_leads set atendente_dc_id = null, vendedor_id = null where atendente_dc_id = new.dc_id;
    update public.funil_conversas set atendente_dc_id = null, vendedor_id = null where atendente_dc_id = new.dc_id;
  else
    update public.funil_leads set vendedor_id = new.equipe_id
     where atendente_dc_id = new.dc_id and vendedor_id is distinct from new.equipe_id;
    update public.funil_conversas set vendedor_id = new.equipe_id
     where atendente_dc_id = new.dc_id and vendedor_id is distinct from new.equipe_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Histórico de mudanças no funil (marcas nos gráficos)
-- ---------------------------------------------------------------------------
create table public.funil_mudancas (
  id          bigint generated always as identity primary key,
  dia         date not null,
  etapa_id    bigint references public.funil_etapas (id),
  descricao   text not null check (length(trim(descricao)) between 3 and 300),
  criado_por  uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now()
);

create index funil_mudancas_dia_idx on public.funil_mudancas (dia);
create index funil_mudancas_etapa_id_idx on public.funil_mudancas (etapa_id);
create index funil_mudancas_criado_por_idx on public.funil_mudancas (criado_por);

-- ---------------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------------
alter table public.funil_config    enable row level security;
alter table public.funil_conversas enable row level security;
alter table public.funil_mudancas  enable row level security;

revoke all on public.funil_config, public.funil_conversas, public.funil_mudancas from anon;
grant select on public.funil_config, public.funil_conversas, public.funil_mudancas to authenticated;
grant update (horas_espera, atendimento_inicio, atendimento_fim, atualizado_por, atualizado_em) on public.funil_config to authenticated;
grant insert, update, delete on public.funil_mudancas to authenticated;

create policy "logado le config do funil" on public.funil_config for select to authenticated using (true);
create policy "admin edita config do funil" on public.funil_config for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- conversas: admin vê todas; vendedor só as dele
create policy "le conversas: admin tudo, vendedor as proprias" on public.funil_conversas
  for select to authenticated
  using ((select privado.eh_admin()) or vendedor_id = (select privado.minha_equipe_id()));

create policy "logado le mudancas" on public.funil_mudancas for select to authenticated using (true);
create policy "admin cria mudanca" on public.funil_mudancas for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita mudanca" on public.funil_mudancas for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
create policy "admin apaga mudanca" on public.funil_mudancas for delete to authenticated using ((select privado.eh_admin()));
