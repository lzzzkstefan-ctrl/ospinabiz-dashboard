// Avisos do Check-in que dependem do relógio: pausa longa, operação descoberta e sem check-in
// (modulos/escala/alertas.ts) e o lembrete das 20h dos compromissos de amanhã (compromissos.ts).
// Chamado pelo pg_cron a cada 2 min com Authorization: Bearer CRON_SECRET.

import { chamadaDoCron } from "@/lib/auth/cron";
import { verificarAlertas } from "@/modulos/escala/alertas";
import { lembreteDaVespera } from "@/modulos/escala/compromissos";

export async function POST(request: Request) {
  if (!chamadaDoCron(request)) return Response.json({ ok: false }, { status: 401 });
  const r = await verificarAlertas();
  const vespera = await lembreteDaVespera();
  return Response.json({ ok: true, ...r, vespera });
}
