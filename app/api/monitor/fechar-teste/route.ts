// Fecha um teste alguns minutos depois do envio: marca cada número como
// OK / FALHOU / SEM RESPOSTA e manda o alerta no Telegram.
// Chamado pelo pg_cron no Supabase, com Authorization: Bearer CRON_SECRET.
// Regras ficam em modulos/monitor/avaliar-resultado.ts e montar-alerta.ts.

import { chamadaDoCron } from "@/lib/auth/cron";

export function POST(request: Request) {
  if (!chamadaDoCron(request)) {
    return Response.json({ error: "nao autorizado" }, { status: 401 });
  }

  return Response.json({ error: "nao implementado" }, { status: 501 });
}
