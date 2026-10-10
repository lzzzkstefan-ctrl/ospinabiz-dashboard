// Avisos do Check-in que dependem do relógio: pausa longa, operação descoberta e sem check-in
// (modulos/escala/alertas.ts). Chamado pelo pg_cron a cada 2 min com Authorization: Bearer CRON_SECRET.

import { chamadaDoCron } from "@/lib/auth/cron";
import { verificarAlertas } from "@/modulos/escala/alertas";

export async function POST(request: Request) {
  if (!chamadaDoCron(request)) return Response.json({ ok: false }, { status: 401 });
  const r = await verificarAlertas();
  return Response.json({ ok: true, ...r });
}
