-- Check-in: feriados e a decisão "a operação roda?" (pedido do Davi, 13/10/2026).
--
-- 1. feriados: um por dia. Nacionais vêm da BrasilAPI (fonte 'brasilapi', carregados pelo servidor
--    quando o ano atual ou o próximo ainda não estão na tabela); estaduais, municipais e pontos
--    facultativos o admin cadastra (fonte 'manual'). Todos leem; só o admin cadastra e decide.
-- 2. Decisão: roda = true (vai rodar) / false (não vai rodar) / vazio (sem decisão). Quem decidiu e
--    quando é preenchido sozinho. envios = para quem a mensagem de WhatsApp saiu (e o erro, se deu);
--    lembrete_em = lembrete das 20h da véspera já enviado. Esses dois só o servidor grava.
--    teste = feriado de teste: a mensagem vai só para quem decidiu (nunca para a equipe).
-- 3. equipe_whatsapp: número de WhatsApp de cada pessoa da equipe (para as mensagens automáticas).
--    Só o admin vê e muda (telefone é dado pessoal).
-- 4. notificacoes_enviadas aceita o tipo 'feriado' (push da véspera para o admin).
-- 5. pg_cron de hora em hora chama /api/escala/feriados: carrega o ano da BrasilAPI se faltar, manda o
--    push da véspera (a partir das 9h) e o lembrete das 20h se ninguém decidiu.

-- ---------------------------------------------------------------------------
-- 1 e 2. Feriados
-- ---------------------------------------------------------------------------
create table public.feriados (
  id              bigint generated always as identity primary key,
  data            date not null unique,
  nome            text not null check (length(btrim(nome)) between 1 and 80),
  tipo            text not null default 'manual' check (tipo in ('nacional', 'estadual', 'municipal', 'manual')),
  fonte           text not null default 'manual' check (fonte in ('brasilapi', 'manual')),
  roda            boolean,
  mensagem_extra  text check (mensagem_extra is null or length(mensagem_extra) <= 300),
  decidido_por    uuid references auth.users (id) on delete set null,
  decidido_em     timestamptz,
  envios          jsonb,
  lembrete_em     timestamptz,
  teste           boolean not null default false,
  criado_por      uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now()
);

create index feriados_decidido_por_idx on public.feriados (decidido_por);
create index feriados_criado_por_idx on public.feriados (criado_por);

-- quem decidiu e quando: preenchido sozinho quando a decisão muda
create or replace function privado.feriado_decisao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.roda is distinct from old.roda then
    new.decidido_por := auth.uid();
    new.decidido_em := case when new.roda is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger feriado_decisao
  before update on public.feriados
  for each row execute function privado.feriado_decisao();

-- ---------------------------------------------------------------------------
-- 3. WhatsApp da equipe (só admin)
-- ---------------------------------------------------------------------------
create table public.equipe_whatsapp (
  equipe_id      bigint primary key references public.equipe (id) on delete cascade,
  -- só dígitos, com DDI e DDD (ex.: 55 11 9xxxx xxxx)
  whatsapp       text not null check (whatsapp ~ '^\d{12,13}$'),
  atualizado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Tipo de aviso 'feriado'
-- ---------------------------------------------------------------------------
alter table public.notificacoes_enviadas drop constraint if exists notificacoes_enviadas_tipo_check;
alter table public.notificacoes_enviadas add constraint notificacoes_enviadas_tipo_check
  check (tipo in ('pausa_inicio', 'pausa_fim', 'pausa_longa', 'operacao_descoberta', 'sem_checkin', 'entrada', 'saida', 'teste', 'feriado'));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.feriados        enable row level security;
alter table public.equipe_whatsapp enable row level security;

revoke all on public.feriados, public.equipe_whatsapp from anon, authenticated;
grant select on public.feriados to authenticated;
grant insert (data, nome, tipo), update (roda, mensagem_extra), delete on public.feriados to authenticated;
grant select, delete on public.equipe_whatsapp to authenticated;
grant insert (equipe_id, whatsapp), update (whatsapp, atualizado_em) on public.equipe_whatsapp to authenticated;

create policy "logado le feriados" on public.feriados for select to authenticated using (true);
create policy "admin cadastra feriado manual" on public.feriados for insert to authenticated
  with check ((select privado.eh_admin()) and fonte = 'manual');
create policy "admin decide feriado" on public.feriados for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
create policy "admin apaga feriado manual" on public.feriados for delete to authenticated
  using ((select privado.eh_admin()) and fonte = 'manual');

create policy "admin le whatsapp da equipe" on public.equipe_whatsapp for select to authenticated using ((select privado.eh_admin()));
create policy "admin cadastra whatsapp" on public.equipe_whatsapp for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin muda whatsapp" on public.equipe_whatsapp for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
create policy "admin apaga whatsapp" on public.equipe_whatsapp for delete to authenticated using ((select privado.eh_admin()));

-- ---------------------------------------------------------------------------
-- 5. Relógio: de hora em hora (9h de Brasília = 12h UTC; 20h = 23h UTC)
-- ---------------------------------------------------------------------------
select cron.schedule('escala-feriados', '0 * * * *', $$select privado.chamar_rota_monitor('/api/escala/feriados')$$);
