// Feriados (modulos/escala/feriados.ts): carrega da BrasilAPI o ano que faltar, manda o push da véspera
// (a partir das 9h) e o lembrete das 20h se ninguém decidiu. Chamado pelo pg_cron de hora em hora com
// Authorization: Bearer CRON_SECRET.

import { chamadaDoCron } from "@/lib/auth/cron";
import { verificarFeriados } from "@/modulos/escala/feriados";

export async function POST(request: Request) {
  if (!chamadaDoCron(request)) return Response.json({ ok: false }, { status: 401 });
  const r = await verificarFeriados();
  return Response.json({ ok: true, ...r });
}
