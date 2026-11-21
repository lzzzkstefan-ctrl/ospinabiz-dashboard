// Feriados (modulos/escala/feriados.ts): carrega da BrasilAPI o ano que faltar, manda o push da véspera
// (a partir das 9h) e o lembrete das 20h se ninguém decidiu. Chamado pelo pg_cron de hora em hora com
// Authorization: Bearer CRON_SECRET.

import { chamadaDoCron } from "@/lib/auth/cron";
import { verificarFeriados } from "@/modulos/escala/feriados";
import { ARQUIVADO_EM, soLeitura } from "@/lib/arquivo";

export async function POST(request: Request) {
  // aba arquivada em 21/11/2026: o agendamento foi desligado; se alguém ainda chamar, não faz nada
  if (soLeitura()) return Response.json({ ok: false, arquivado: ARQUIVADO_EM }, { status: 410 });
  if (!chamadaDoCron(request)) return Response.json({ ok: false }, { status: 401 });
  const r = await verificarFeriados();
  return Response.json({ ok: true, ...r });
}
