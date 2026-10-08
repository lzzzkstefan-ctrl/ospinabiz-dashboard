// Fecha um teste alguns minutos depois do envio: marca cada número como
// OK / FALHOU / SEM RESPOSTA e manda o alerta no Telegram.
// Chamado pelo pg_cron no Supabase, com Authorization: Bearer CRON_SECRET.
// Regras ficam em modulos/monitor/avaliar-resultado.ts e montar-alerta.ts.

export function POST() {
  return Response.json({ error: "nao implementado" }, { status: 501 });
}
