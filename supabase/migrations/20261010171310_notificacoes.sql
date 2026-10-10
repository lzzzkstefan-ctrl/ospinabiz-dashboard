-- Notificações push do Check-in (pedido do Davi, 10/10/2026).
--
-- Avisos:
--   pausa_inicio        alguém entrou em pausa ("Vyenna em pausa (Banho) desde 19:40")
--   pausa_fim           alguém voltou da pausa
--   pausa_longa         a pausa passou do limite (escala_config.pausa_longa_min)
--   operacao_descoberta dentro do horário de atendimento, ninguém online (todos em pausa, offline
--                       ou ainda não entraram) — o mais importante
--   sem_checkin         a pessoa não entrou até 15 min depois do início do horário fixo dela
--
-- 1. push_inscricoes: cada aparelho/navegador que ativou as notificações (endpoint + chaves do
--    navegador). Cada um vê, cria e apaga só as próprias. O envio usa a chave secreta (servidor).
-- 2. notificacoes_preferencias: quais avisos cada pessoa quer. Sem linha = padrão: admin recebe
--    todos, os outros nenhum. Cada um muda só as próprias.
-- 3. notificacoes_enviadas: registro do que já foi mandado, com chave única por acontecimento
--    (ex.: a pausa 12, o dia 10/10 da Vyenna): o mesmo aviso nunca sai duas vezes. Só o servidor.
-- 4. escala_alerta_estado: desde quando a operação está descoberta (vazio = coberta), para avisar
--    uma vez quando descobre e uma vez quando volta a ficar coberta. Só o servidor.
-- 5. pg_cron a cada 2 min chama /api/escala/alertas (pausa longa, descoberta, sem check-in).
--    Pausa e volta da pausa avisam na hora (pela própria ação).

create table public.push_inscricoes (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references auth.users (id) on delete cascade default auth.uid(),
  endpoint    text not null unique check (endpoint ~ '^https://'),
  p256dh      text not null,
  auth        text not null,
  aparelho    text check (aparelho is null or length(aparelho) <= 200),
  criado_em   timestamptz not null default now(),
  ultimo_envio timestamptz
);
create index push_inscricoes_usuario_id_idx on public.push_inscricoes (usuario_id);

create table public.notificacoes_preferencias (
  usuario_id          uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  pausa_inicio        boolean not null,
  pausa_fim           boolean not null,
  pausa_longa         boolean not null,
  operacao_descoberta boolean not null,
  sem_checkin         boolean not null,
  atualizado_em       timestamptz not null default now()
);

create table public.notificacoes_enviadas (
  id          bigint generated always as identity primary key,
  tipo        text not null check (tipo in ('pausa_inicio', 'pausa_fim', 'pausa_longa', 'operacao_descoberta', 'sem_checkin', 'teste')),
  chave       text not null,
  titulo      text not null,
  corpo       text,
  enviados    integer not null default 0,
  criado_em   timestamptz not null default now(),
  unique (tipo, chave)
);
create index notificacoes_enviadas_criado_em_idx on public.notificacoes_enviadas (criado_em);

create table public.escala_alerta_estado (
  id                 boolean primary key default true check (id),
  descoberta_desde   timestamptz
);
insert into public.escala_alerta_estado default values;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.push_inscricoes           enable row level security;
alter table public.notificacoes_preferencias enable row level security;
alter table public.notificacoes_enviadas     enable row level security;
alter table public.escala_alerta_estado      enable row level security;

revoke all on public.push_inscricoes, public.notificacoes_preferencias, public.notificacoes_enviadas, public.escala_alerta_estado from anon, authenticated;
grant select, delete on public.push_inscricoes to authenticated;
grant insert (endpoint, p256dh, auth, aparelho) on public.push_inscricoes to authenticated;
grant select on public.notificacoes_preferencias to authenticated;
grant insert (pausa_inicio, pausa_fim, pausa_longa, operacao_descoberta, sem_checkin),
      update (pausa_inicio, pausa_fim, pausa_longa, operacao_descoberta, sem_checkin, atualizado_em)
   on public.notificacoes_preferencias to authenticated;
-- notificacoes_enviadas e escala_alerta_estado: só o servidor (chave secreta), nenhuma regra para logado

create policy "le as proprias inscricoes" on public.push_inscricoes
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "cria inscricao propria" on public.push_inscricoes
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "apaga inscricao propria" on public.push_inscricoes
  for delete to authenticated using (usuario_id = (select auth.uid()));

create policy "le as proprias preferencias" on public.notificacoes_preferencias
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "cria preferencias proprias" on public.notificacoes_preferencias
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "muda preferencias proprias" on public.notificacoes_preferencias
  for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

-- a cada 2 minutos: pausa longa, operação descoberta, sem check-in
select cron.schedule('escala-alertas', '*/2 * * * *', $$select privado.chamar_rota_monitor('/api/escala/alertas')$$);
