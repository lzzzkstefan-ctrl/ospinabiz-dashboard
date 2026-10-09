-- Módulo Funil: o relógio. A cada 15 minutos o pg_cron chama /api/funil/sincronizar
-- (Authorization: Bearer cron_secret, pela mesma função do Monitor e de Vendas).
-- A rota responde na hora e faz a rodada em segundo plano (modulos/funil/sincronizar.ts).
-- Aplicar só depois que a rota estiver no ar na Vercel (com DATACRAZY_API_KEY configurada).

select cron.schedule('funil-sincronizar', '*/15 * * * *', $$select privado.chamar_rota_monitor('/api/funil/sincronizar')$$);
