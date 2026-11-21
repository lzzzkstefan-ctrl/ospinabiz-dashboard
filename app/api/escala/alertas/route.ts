// Avisos do Check-in que dependem do relógio: pausa longa, operação descoberta e sem check-in
// (modulos/escala/alertas.ts) e o lembrete das 20h dos compromissos de amanhã (compromissos.ts).
// Chamado pelo pg_cron a cada 2 min com Authorization: Bearer CRON_SECRET.

import { chamadaDoCron } from "@/lib/auth/cron";
import { verificarAlertas } from "@/modulos/escala/alertas";
import { lembreteDaVespera } from "@/modulos/escala/compromissos";
import { ARQUIVADO_EM, soLeitura } from "@/lib/arquivo";

export async function POST(request: Request) {
  // aba arquivada em 21/11/2026: o agendamento foi desligado; se alguém ainda chamar, não faz nada
  if (soLeitura()) return Response.json({ ok: false, arquivado: ARQUIVADO_EM }, { status: 410 });
  if (!chamadaDoCron(request)) return Response.json({ ok: false }, { status: 401 });
  const r = await verificarAlertas();
  const vespera = await lembreteDaVespera();
  return Response.json({ ok: true, ...r, vespera });
}
