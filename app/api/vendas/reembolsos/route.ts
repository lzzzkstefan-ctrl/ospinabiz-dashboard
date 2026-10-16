// Lembretes dos pedidos de reembolso (modulos/vendas/reembolsos.ts): pendente há 24h e prazo < 24h.
// Chamado pelo pg_cron a cada 15 min com Authorization: Bearer CRON_SECRET.

import { chamadaDoCron } from "@/lib/auth/cron";
import { verificarLembretes } from "@/modulos/vendas/reembolsos";

export async function POST(request: Request) {
  if (!chamadaDoCron(request)) return Response.json({ ok: false }, { status: 401 });
  const r = await verificarLembretes();
  return Response.json({ ok: true, ...r });
}
