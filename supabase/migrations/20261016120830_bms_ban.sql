-- BM banida (pedido do Davi em 16/10/2026). Não apaga nada:
--   - monitor_bms ganha banida_em (data do ban) e ban_motivo. BM banida = banida_em preenchida;
--   - monitor_numeros ganha banido_em (data do ban do número) e situacao_antes_ban (a situação que o
--     número tinha antes de a BM ser banida, para o "Desfazer ban" voltar a ela);
--   - banir a BM marca todos os números dela como banido, com a mesma data; desfazer volta a BM e os
--     números que ela baniu para a situação anterior (número banido sozinho, antes, continua banido).
-- Banido não entra no monitor (que só testa situação "operacao") e sai das seções de ativos da aba BMs.

alter table public.monitor_bms
  add column banida_em  date,
  add column ban_motivo text check (ban_motivo is null or length(btrim(ban_motivo)) between 1 and 300),
  add constraint monitor_bms_motivo_so_banida check (banida_em is not null or ban_motivo is null);

alter table public.monitor_numeros
  add column banido_em          date,
  add column situacao_antes_ban text check (situacao_antes_ban in ('operacao', 'desconectado'));

comment on column public.monitor_bms.banida_em is 'Data do ban da BM (null = não banida).';
comment on column public.monitor_numeros.banido_em is 'Data do ban do número (só quando situacao = banido).';
comment on column public.monitor_numeros.situacao_antes_ban is 'Situação antes de a BM ser banida; o Desfazer ban volta para ela.';

-- ---------------------------------------------------------------------------
-- Data do ban do número: preenche ao virar banido (hoje, em Brasília, se não vier) e limpa ao sair.
-- ---------------------------------------------------------------------------
create or replace function privado.monitor_numero_ban()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.situacao <> 'banido' then
    new.banido_em := null;
    new.situacao_antes_ban := null;
  elsif tg_op = 'INSERT' or old.situacao <> 'banido' or new.banido_em is null then
    new.banido_em := coalesce(new.banido_em, (now() at time zone 'America/Sao_Paulo')::date);
  end if;
  return new;
end;
$$;

create trigger monitor_numeros_ban
  before insert or update of situacao, banido_em on public.monitor_numeros
  for each row execute function privado.monitor_numero_ban();

-- ---------------------------------------------------------------------------
-- Banir e desfazer o ban de uma BM (só admin; o RLS de edição também confere).
-- ---------------------------------------------------------------------------
create or replace function public.bm_banir(p_bm_id bigint, p_data date, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not (select privado.eh_admin()) then
    raise exception 'Só admin pode banir uma BM.';
  end if;
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Data do ban inválida.';
  end if;

  update public.monitor_bms
     set banida_em = p_data, ban_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_bm_id;
  if not found then
    raise exception 'BM não encontrada.';
  end if;

  -- os números que ainda não estavam banidos guardam a situação de antes
  update public.monitor_numeros
     set situacao_antes_ban = situacao, situacao = 'banido', banido_em = p_data
   where bm_id = p_bm_id and situacao <> 'banido';
end;
$$;

create or replace function public.bm_desfazer_ban(p_bm_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not (select privado.eh_admin()) then
    raise exception 'Só admin pode desfazer o ban.';
  end if;

  update public.monitor_numeros
     set situacao = situacao_antes_ban
   where bm_id = p_bm_id and situacao = 'banido' and situacao_antes_ban is not null;

  update public.monitor_bms set banida_em = null, ban_motivo = null where id = p_bm_id;
  if not found then
    raise exception 'BM não encontrada.';
  end if;
end;
$$;

revoke execute on function public.bm_banir(bigint, date, text), public.bm_desfazer_ban(bigint) from public, anon;
grant execute on function public.bm_banir(bigint, date, text), public.bm_desfazer_ban(bigint) to authenticated;
