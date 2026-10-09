-- Funil: atendente "Suporte Data Crazy" (equipe da Data Crazy, não vendedor).
-- - Não conta no funil por vendedor: a sincronização pula esse atendente ao escolher
--   o vendedor do lead. Lead atendido só por eles fica sem vendedor.
-- - O admin marca/desmarca pela tela (Configuração). Ao marcar, os leads que estavam
--   com esse atendente ficam sem vendedor na hora; a próxima sincronização procura
--   outro atendente (não suporte) nas conversas do lead.
-- Quem é suporte é dado (fica no banco, fora do git).

alter table public.funil_atendentes
  add column suporte_dc boolean not null default false,
  add constraint funil_atendentes_suporte_sem_equipe check (not (suporte_dc and equipe_id is not null));

grant update (suporte_dc) on public.funil_atendentes to authenticated;

-- Gatilho: além de propagar a pessoa da equipe, solta os leads quando o atendente vira suporte.
create or replace function privado.funil_atendente_propaga_vendedor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.suporte_dc then
    update public.funil_leads
       set atendente_dc_id = null, vendedor_id = null
     where atendente_dc_id = new.dc_id;
  else
    update public.funil_leads
       set vendedor_id = new.equipe_id
     where atendente_dc_id = new.dc_id
       and vendedor_id is distinct from new.equipe_id;
  end if;
  return new;
end;
$$;

drop trigger funil_atendente_propaga_vendedor on public.funil_atendentes;
create trigger funil_atendente_propaga_vendedor
  after update of equipe_id, suporte_dc on public.funil_atendentes
  for each row execute function privado.funil_atendente_propaga_vendedor();
