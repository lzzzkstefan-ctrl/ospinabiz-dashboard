-- Check-in: compromissos previstos (pedido do Davi, 18/10/2026).
-- Quem já sabe que vai se ausentar ou atrasar cadastra (data, de/até ou dia inteiro, tipo, motivo
-- opcional) e a equipe fica sabendo (push). No calendário "Esta semana" o compromisso aparece no card
-- do dia, e o período avisado não conta como atraso nem "não entrou". Dia inteiro fora sem mais
-- ninguém escalado: o dia fica descoberto (igual ao sábado sem escala).
--
-- Quem pode o quê (RLS):
-- - todos os logados leem;
-- - cada um cria os próprios (pessoa = ele) e edita/cancela os que cadastrou; o admin cria para
--   qualquer pessoa e edita/cancela todos;
-- - só de hoje em diante (data em Brasília). Cancelar = cancelado = true (nada é apagado).
-- Quem criou, mudou e cancelou o banco preenche sozinho (gatilho), sem o navegador informar.

create table public.compromissos (
  id             bigint generated always as identity primary key,
  pessoa         bigint not null references public.equipe (id) on delete cascade,
  data           date not null,
  inicio         time,
  fim            time,
  dia_inteiro    boolean not null default false,
  tipo           text not null check (tipo in ('atraso_entrada', 'saida_cedo', 'ausencia', 'dia_inteiro')),
  motivo         text check (motivo is null or length(motivo) between 1 and 80),
  criado_por     uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),
  cancelado      boolean not null default false,
  cancelado_por  uuid references auth.users (id) on delete set null,
  cancelado_em   timestamptz,
  atualizado_por uuid references auth.users (id) on delete set null,
  atualizado_em  timestamptz,
  -- "Dia inteiro fora" = dia inteiro, sem horário; os outros tipos têm de/até
  constraint compromissos_dia_inteiro check (dia_inteiro = (tipo = 'dia_inteiro')),
  constraint compromissos_horario check (
    (dia_inteiro and inicio is null and fim is null)
    or (not dia_inteiro and inicio is not null and fim is not null and inicio < fim)
  )
);

comment on table public.compromissos is
  'Compromissos previstos da equipe (atraso, saída mais cedo, ausência, dia inteiro fora). Cancelar não apaga.';

create index compromissos_data_idx on public.compromissos (data) where not cancelado;
create index compromissos_pessoa_idx on public.compromissos (pessoa);
create index compromissos_criado_por_idx on public.compromissos (criado_por);
create index compromissos_cancelado_por_idx on public.compromissos (cancelado_por);
create index compromissos_atualizado_por_idx on public.compromissos (atualizado_por);

-- quem criou não muda; quem mudou e quem cancelou vêm do login
create or replace function privado.compromisso_registro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.criado_por := old.criado_por;
  new.criado_em := old.criado_em;
  if new.cancelado and not old.cancelado then
    new.cancelado_por := auth.uid();
    new.cancelado_em := now();
  elsif not new.cancelado then
    new.cancelado_por := null;
    new.cancelado_em := null;
  else
    new.cancelado_por := old.cancelado_por;
    new.cancelado_em := old.cancelado_em;
  end if;
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger compromisso_registro
  before update on public.compromissos
  for each row execute function privado.compromisso_registro();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.compromissos enable row level security;

revoke all on public.compromissos from anon, authenticated;
grant select on public.compromissos to authenticated;
grant insert (pessoa, data, inicio, fim, dia_inteiro, tipo, motivo),
      update (pessoa, data, inicio, fim, dia_inteiro, tipo, motivo, cancelado)
   on public.compromissos to authenticated;

create policy "logado le compromissos" on public.compromissos
  for select to authenticated using (true);

create policy "cria compromisso: o proprio, ou admin para qualquer um" on public.compromissos
  for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and data >= ((now() at time zone 'America/Sao_Paulo')::date)
    and ((select privado.eh_admin()) or pessoa = (select privado.minha_equipe_id()))
  );

create policy "edita compromisso: quem cadastrou, ou admin" on public.compromissos
  for update to authenticated
  using (
    data >= ((now() at time zone 'America/Sao_Paulo')::date)
    and ((select privado.eh_admin()) or criado_por = (select auth.uid()))
  )
  with check (
    data >= ((now() at time zone 'America/Sao_Paulo')::date)
    and ((select privado.eh_admin()) or (criado_por = (select auth.uid()) and pessoa = (select privado.minha_equipe_id())))
  );

-- ---------------------------------------------------------------------------
-- Aviso 'compromisso' (cadastro, mudança, cancelamento e lembrete da véspera às 20h).
-- Preferência própria: sem escolha salva, TODOS recebem (é aviso para a equipe).
-- ---------------------------------------------------------------------------
alter table public.notificacoes_enviadas drop constraint if exists notificacoes_enviadas_tipo_check;
alter table public.notificacoes_enviadas add constraint notificacoes_enviadas_tipo_check
  check (tipo in ('pausa_inicio', 'pausa_fim', 'pausa_longa', 'operacao_descoberta', 'sem_checkin', 'entrada', 'saida', 'teste', 'feriado', 'reembolso', 'venda', 'compromisso'));

alter table public.notificacoes_preferencias add column compromisso boolean;
grant insert (compromisso), update (compromisso) on public.notificacoes_preferencias to authenticated;
