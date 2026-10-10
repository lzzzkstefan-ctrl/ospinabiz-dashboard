-- Check-in: PAUSA (pedido do Davi, 10/10/2026).
--
-- 1. escala_pausas: quem está online pode pausar (Almoço, Banho, Imprevisto, Outro + texto
--    opcional) e voltar. Uma pausa aberta por vez, sempre dentro de uma entrada aberta.
--    Começar e voltar pelas funções (hora do servidor; ninguém digita).
-- 2. Saiu da operação (botão, saída automática ou correção do admin) durante uma pausa: a pausa
--    termina junto (gatilho em escala_checkins quando ganha fim).
-- 3. escala_config: a partir de quantos minutos a pausa é "longa" (padrão 30; só o admin muda).
-- O tempo em pausa não conta como tempo online (a conta é feita na tela).

create table public.escala_pausas (
  id          bigint generated always as identity primary key,
  checkin_id  bigint not null references public.escala_checkins (id) on delete cascade,
  equipe_id   bigint not null references public.equipe (id),
  motivo      text not null check (motivo in ('almoco', 'banho', 'imprevisto', 'outro')),
  detalhe     text check (detalhe is null or length(detalhe) <= 120),
  inicio      timestamptz not null default now(),
  fim         timestamptz,
  -- terminou porque a pessoa saiu da operação (ou saída automática) sem voltar da pausa
  encerrada_com_saida boolean not null default false,
  constraint escala_pausas_horario check (fim is null or fim >= inicio)
);

-- uma pausa aberta por pessoa
create unique index escala_pausas_uma_aberta on public.escala_pausas (equipe_id) where fim is null;
create index escala_pausas_checkin_id_idx on public.escala_pausas (checkin_id);
create index escala_pausas_inicio_idx on public.escala_pausas (inicio);

create table public.escala_config (
  id                 boolean primary key default true check (id),
  pausa_longa_min    integer not null default 30 check (pausa_longa_min between 1 and 600),
  atualizado_por     uuid references auth.users (id) on delete set null,
  atualizado_em      timestamptz not null default now()
);
insert into public.escala_config default values;
create index escala_config_atualizado_por_idx on public.escala_config (atualizado_por);

-- ---------------------------------------------------------------------------
-- Pausar / voltar (sempre a própria pausa, hora do servidor)
-- ---------------------------------------------------------------------------
create or replace function public.escala_pausar(p_motivo text, p_detalhe text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu bigint := (select privado.minha_equipe_id());
  turno bigint;
  nova bigint;
begin
  if eu is null then
    raise exception 'Seu login não está ligado a ninguém da equipe.';
  end if;
  select id into turno from public.escala_checkins where equipe_id = eu and fim is null;
  if turno is null then
    raise exception 'Você não está na operação.';
  end if;
  if exists (select 1 from public.escala_pausas where equipe_id = eu and fim is null) then
    raise exception 'Você já está em pausa.';
  end if;
  if p_motivo not in ('almoco', 'banho', 'imprevisto', 'outro') then
    raise exception 'Motivo de pausa inválido.';
  end if;
  insert into public.escala_pausas (checkin_id, equipe_id, motivo, detalhe)
  values (turno, eu, p_motivo, nullif(left(btrim(coalesce(p_detalhe, '')), 120), ''))
  returning id into nova;
  return nova;
end;
$$;

create or replace function public.escala_voltar_da_pausa()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.escala_pausas set fim = now()
   where equipe_id = (select privado.minha_equipe_id()) and fim is null;
  if not found then
    raise exception 'Você não está em pausa.';
  end if;
end;
$$;

revoke execute on function public.escala_pausar(text, text), public.escala_voltar_da_pausa() from public, anon;
grant execute on function public.escala_pausar(text, text), public.escala_voltar_da_pausa() to authenticated;

-- ---------------------------------------------------------------------------
-- Saiu da operação durante a pausa: a pausa termina junto (no mesmo horário da saída)
-- ---------------------------------------------------------------------------
create or replace function privado.escala_saida_encerra_pausa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fim is not null and old.fim is null then
    update public.escala_pausas
       set fim = greatest(inicio, new.fim),
           encerrada_com_saida = true
     where checkin_id = new.id and fim is null;
  end if;
  return new;
end;
$$;

create trigger escala_saida_encerra_pausa
  after update of fim on public.escala_checkins
  for each row execute function privado.escala_saida_encerra_pausa();

-- ---------------------------------------------------------------------------
-- RLS: todos leem (quem está em pausa aparece em "Online agora"); escrever só pelas funções;
-- a configuração só o admin muda
-- ---------------------------------------------------------------------------
alter table public.escala_pausas enable row level security;
alter table public.escala_config enable row level security;

revoke all on public.escala_pausas, public.escala_config from anon, authenticated;
grant select on public.escala_pausas, public.escala_config to authenticated;
grant update (pausa_longa_min, atualizado_por, atualizado_em) on public.escala_config to authenticated;

create policy "logado le pausas" on public.escala_pausas for select to authenticated using (true);
create policy "logado le config da escala" on public.escala_config for select to authenticated using (true);
create policy "admin edita config da escala" on public.escala_config for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));
