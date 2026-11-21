-- Arquivar as abas da operação (21/11/2026, pedido do Davi): a operação do dia a dia passou para o
-- Prime e o app virou a central de gestão. Monitor, Check-in, BMs, Webinários (antigo), Funil (antigo),
-- Tarefas e Melhorias ficam em "Arquivado", só leitura. NADA é apagado: nem dados, nem tabelas.
-- Contexto em docs/modulos/arquivado.md.
--
-- 1) Desliga os agendamentos que só serviam a essas abas.
-- 2) Trava gravação nas tabelas delas (o código também recusa: lib/arquivo.ts).
--
-- Continua ligado: vendas-processar-pendentes, vendas-reembolsos-lembretes, o webhook da Hubla e os
-- avisos de venda e reembolso.
--
-- Para reativar um agendamento (copiar o original):
--   select cron.schedule('escala-alertas', '*/2 * * * *', $$select privado.chamar_rota_monitor('/api/escala/alertas')$$);
--   select cron.schedule('escala-feriados', '0 * * * *', $$select privado.chamar_rota_monitor('/api/escala/feriados')$$);
--   select cron.schedule('escala-encerrar-esquecidos', '*/15 * * * *', $$select privado.escala_encerrar_esquecidos()$$);
--   select cron.schedule('monitor-rodar-teste-manha',  '30 10 * * *', $$select privado.chamar_rota_monitor('/api/monitor/rodar-teste')$$);
--   select cron.schedule('monitor-fechar-teste-manha', '40 10 * * *', $$select privado.chamar_rota_monitor('/api/monitor/fechar-teste')$$);
--   select cron.schedule('monitor-rodar-teste-tarde',  '0 20 * * *',  $$select privado.chamar_rota_monitor('/api/monitor/rodar-teste')$$);
--   select cron.schedule('monitor-fechar-teste-tarde', '10 20 * * *', $$select privado.chamar_rota_monitor('/api/monitor/fechar-teste')$$);
--   select cron.schedule('funil-sincronizar', '*/15 * * * *', $$select privado.chamar_rota_monitor('/api/funil/sincronizar')$$);
-- Para destravar uma tabela: drop trigger arquivada_so_leitura on public.<tabela>;

-- ---------------------------------------------------------------------------
-- 1) agendamentos
-- ---------------------------------------------------------------------------
select cron.unschedule(jobname)
  from cron.job
 where jobname in (
   'escala-alertas',
   'escala-feriados',
   'escala-encerrar-esquecidos',
   'monitor-rodar-teste-manha',
   'monitor-fechar-teste-manha',
   'monitor-rodar-teste-tarde',
   'monitor-fechar-teste-tarde',
   'funil-sincronizar'
 );

-- ---------------------------------------------------------------------------
-- 2) trava de só leitura
-- ---------------------------------------------------------------------------
create or replace function privado.arquivada_so_leitura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Aba arquivada em 21/11/2026: % é só leitura.', tg_table_name
    using errcode = 'P0001';
end;
$$;

comment on function privado.arquivada_so_leitura() is
  'Recusa gravação nas tabelas das abas arquivadas em 21/11/2026 (Monitor, Check-in, BMs, Webinários, Funil, Tarefas, Melhorias).';

-- Só tabelas de verdade (as visões funil_*_equipe só leem). Ficam de fora as que continuam em uso:
-- equipe, vendas*, vendedores, tickets, hubla_eventos, plataformas, custos_fixos*, config_painel,
-- usuarios_registro, push_*, notificacoes_enviadas.
do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and (
         c.relname like 'monitor\_%'
         or c.relname like 'escala\_%'
         or c.relname like 'funil\_%'
         or c.relname like 'webinario%'
         or c.relname in ('tarefas', 'melhorias', 'compromissos', 'feriados', 'equipe_whatsapp', 'notificacoes_preferencias')
       )
     order by 1
  loop
    execute format(
      'create trigger arquivada_so_leitura before insert or update or delete or truncate on public.%I for each statement execute function privado.arquivada_so_leitura()',
      t
    );
    raise notice 'travada: %', t;
  end loop;
end;
$$;
