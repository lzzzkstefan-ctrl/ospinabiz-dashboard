-- Módulo Monitor: o relógio.
-- "O Supabase é o relógio, a Vercel faz o trabalho": o pg_cron só chama as rotas
-- app/api/monitor/* no horário; o envio, o fechamento e o alerta rodam no Next.
--
-- Os valores ficam no Vault do Supabase (nunca neste arquivo nem no git):
--   monitor_app_url  endereço do app na Vercel, sem barra no fim
--   cron_secret      a mesma senha de CRON_SECRET da Vercel; vai no cabeçalho Authorization
--
-- Horários (pg_cron roda em UTC; America/Sao_Paulo = UTC-3, sem horário de verão):
--   7h30  rodar-teste   = 30 10 * * *    7h40  fechar-teste = 40 10 * * *
--   17h00 rodar-teste   =  0 20 * * *   17h10  fechar-teste = 10 20 * * *
-- O fechamento espera 10 minutos para dar tempo de a Meta mandar os status pelo webhook.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Chama uma rota do app com Authorization: Bearer <cron_secret>.
-- Devolve o id do pedido no pg_net (a resposta fica em net._http_response).
-- ---------------------------------------------------------------------------
create or replace function privado.chamar_rota_monitor(caminho text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  app_url text;
  segredo text;
  pedido  bigint;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'monitor_app_url';
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'cron_secret';

  if app_url is null or segredo is null then
    raise exception 'Faltam segredos no Vault: monitor_app_url e/ou cron_secret';
  end if;

  select net.http_post(
    url                  := app_url || caminho,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'Authorization', 'Bearer ' || segredo
                            ),
    body                 := jsonb_build_object('origem', 'cron'),
    timeout_milliseconds := 30000
  ) into pedido;

  return pedido;
end;
$$;

revoke execute on function privado.chamar_rota_monitor(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Agendamentos. cron.schedule com o mesmo nome substitui o job existente.
-- ---------------------------------------------------------------------------
select cron.schedule('monitor-rodar-teste-manha',  '30 10 * * *', $$select privado.chamar_rota_monitor('/api/monitor/rodar-teste')$$);
select cron.schedule('monitor-fechar-teste-manha', '40 10 * * *', $$select privado.chamar_rota_monitor('/api/monitor/fechar-teste')$$);
select cron.schedule('monitor-rodar-teste-tarde',  '0 20 * * *',  $$select privado.chamar_rota_monitor('/api/monitor/rodar-teste')$$);
select cron.schedule('monitor-fechar-teste-tarde', '10 20 * * *', $$select privado.chamar_rota_monitor('/api/monitor/fechar-teste')$$);
