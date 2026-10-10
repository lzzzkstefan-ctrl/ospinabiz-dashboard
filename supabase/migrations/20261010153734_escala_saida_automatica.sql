-- Check-in: saída automática no fim do horário fixo DA PESSOA (pedido do Davi, 10/10/2026).
--
-- Antes: turno esquecido aberto fechava às 22h05 no fim do atendimento da operação.
-- Agora: fecha no fim do horário fixo (escala padrão) daquela pessoa no dia em que entrou e fica
-- marcado como saída automática (encerrado_auto). Ex.: Vyenna 9h–22h entrou 9h05 e esqueceu de sair
-- → sai às 22h.
-- Sem horário fixo no dia (ou entrou depois do fim dele): fecha à meia-noite do dia em que entrou.
-- Roda a cada 15 minutos (o fim do horário muda de pessoa para pessoa).

create or replace function privado.escala_encerrar_esquecidos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('escala.sistema', 'sim', true);
  with abertos as (
    select c.id,
           c.inicio,
           (c.inicio at time zone 'America/Sao_Paulo')::date as dia,
           (select max(p.fim)
              from public.escala_padrao p
             where p.equipe_id = c.equipe_id
               and p.dia_semana = extract(dow from (c.inicio at time zone 'America/Sao_Paulo')::date)
               and p.desde <= (c.inicio at time zone 'America/Sao_Paulo')::date
               and (p.ate is null or p.ate >= (c.inicio at time zone 'America/Sao_Paulo')::date)) as fim_fixo
      from public.escala_checkins c
     where c.fim is null
  ),
  limites as (
    select a.id,
           case
             when a.fim_fixo is not null and ((a.dia + a.fim_fixo) at time zone 'America/Sao_Paulo') > a.inicio
               then ((a.dia + a.fim_fixo) at time zone 'America/Sao_Paulo')
             else (((a.dia + 1)::timestamp) at time zone 'America/Sao_Paulo')
           end as limite
      from abertos a
  )
  update public.escala_checkins c
     set fim = l.limite,
         encerrado_auto = true
    from limites l
   where c.id = l.id
     and l.limite <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function privado.escala_encerrar_esquecidos() from public, anon, authenticated;

-- mesmo nome = substitui o agendamento de 22h05
select cron.schedule('escala-encerrar-esquecidos', '*/15 * * * *', $$select privado.escala_encerrar_esquecidos()$$);
