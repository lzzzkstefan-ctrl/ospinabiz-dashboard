// Recibo do service worker (public/sw.js): o aviso chegou no aparelho e foi mostrado.
// /api passa pelo proxy sem exigir login e o service worker pode rodar sem sessão válida. Quem chamou é
// conferido pelo id da entrega: aleatório, vai cifrado só para aquele aparelho e só marca aquela entrega.

import { registrarRecebimento } from "@/lib/notificacoes";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => null)) as { entrega?: unknown; versao?: unknown } | null;
  const valido = await registrarRecebimento(createAdminClient(), corpo?.entrega, corpo?.versao);
  return new Response(null, { status: valido ? 204 : 400 });
}
