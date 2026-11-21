// Fecha um teste alguns minutos depois do envio: marca cada número como
// OK / FALHOU / SEM RESPOSTA e manda o alerta no Telegram.
// Chamado pelo pg_cron no Supabase, com Authorization: Bearer CRON_SECRET.
// Regras ficam em modulos/monitor/avaliar-resultado.ts e montar-alerta.ts.

import { chamadaDoCron } from "@/lib/auth/cron";
import { ARQUIVADO_EM, soLeitura } from "@/lib/arquivo";

export function POST(request: Request) {
  // aba arquivada em 21/11/2026: o agendamento foi desligado; se alguém ainda chamar, não faz nada
  if (soLeitura()) return Response.json({ ok: false, arquivado: ARQUIVADO_EM }, { status: 410 });
  if (!chamadaDoCron(request)) {
    return Response.json({ error: "nao autorizado" }, { status: 401 });
  }

  return Response.json({ error: "nao implementado" }, { status: 501 });
}
