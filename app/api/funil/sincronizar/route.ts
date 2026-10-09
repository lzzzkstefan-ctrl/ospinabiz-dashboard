// Sincroniza o Funil com a Data Crazy (modulos/funil/sincronizar.ts).
// Chamado por:
//   - pg_cron no Supabase a cada 15 min, com Authorization: Bearer CRON_SECRET;
//   - botão "sincronizar agora" na tela (só admin).
// Responde na hora (202) e faz o trabalho depois, com `after`: a chamada do pg_net
// desiste em 30 s, e a rodada pode levar até ~4 min.

import { after } from "next/server";
import { chamadaDoCron } from "@/lib/auth/cron";
import { ehAdmin } from "@/lib/auth/papeis";
import { sincronizarFunil } from "@/modulos/funil/sincronizar";

export const maxDuration = 300;

export async function POST(request: Request) {
  const autorizado = chamadaDoCron(request) || (await ehAdmin());
  if (!autorizado) return Response.json({ ok: false }, { status: 401 });

  after(async () => {
    const r = await sincronizarFunil();
    if (r.situacao === "falhou") console.error("funil: sincronização falhou:", r.erro);
  });
  return Response.json({ ok: true, iniciada: true }, { status: 202 });
}
