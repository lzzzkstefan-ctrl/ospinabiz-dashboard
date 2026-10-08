-- Vendas: webhook da Hubla pela Edge Function (supabase/functions/hubla-webhook).
-- A Edge Function só grava o evento; quem aplica a regra é o Next (/api/vendas/processar).
--
-- 1. chave_idempotencia: o cabeçalho x-hubla-idempotency. Única: a Hubla reenviando o mesmo
--    evento bate na trava e não grava de novo. Vazia (null) não trava (eventos antigos).
-- 2. origem: por onde o evento entrou (vercel = rota antiga do Next, edge = Edge Function).
-- 3. Gatilho: evento novo e não processado → chama /api/vendas/processar com o id, pelo
--    pg_net (assíncrono, depois do commit). Usa os mesmos segredos do Vault do monitor
--    (monitor_app_url e cron_secret).
-- 4. Rede de segurança: a cada 10 minutos o pg_cron chama /api/vendas/processar sem id,
--    que pega os pendentes (falhou ou o gatilho não chegou), até 5 tentativas por evento.

alter table public.hubla_eventos
  add column chave_idempotencia text,
  add column origem text not null default 'vercel' check (origem in ('vercel', 'edge')),
  add constraint hubla_eventos_chave_idempotencia_key unique (chave_idempotencia);

create or replace function privado.hubla_evento_processar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  segredo text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'monitor_app_url';
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'cron_secret';

  -- Sem segredo não trava a gravação do evento: o cron processa depois.
  if app_url is null or segredo is null then
    raise warning 'hubla_eventos %: faltam segredos no Vault (monitor_app_url/cron_secret)', new.id;
    return null;
  end if;

  perform net.http_post(
    url                  := app_url || '/api/vendas/processar',
    headers              := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || segredo),
    body                 := jsonb_build_object('id', new.id),
    timeout_milliseconds := 30000
  );
  return null;
end;
$$;

revoke execute on function privado.hubla_evento_processar() from public, anon, authenticated, service_role;

create trigger hubla_eventos_processar
  after insert on public.hubla_eventos
  for each row
  when (not new.processado)
  execute function privado.hubla_evento_processar();

select cron.schedule('vendas-processar-pendentes', '*/10 * * * *', $$select privado.chamar_rota_monitor('/api/vendas/processar')$$);
