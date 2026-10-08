// Dispara um teste: envia o template para os 18 números monitorados.
// Chamado por:
//   - pg_cron no Supabase (7h30 e 17h, America/Sao_Paulo), com Authorization: Bearer CRON_SECRET;
//   - botão "rodar teste agora" na tela do monitor (usuário logado).
// Regras ficam em modulos/monitor/enviar-teste.ts.

import { chamadaDoCron } from "@/lib/auth/cron";
import { usuarioLogado } from "@/lib/auth/papeis";

export async function POST(request: Request) {
  const autorizado = chamadaDoCron(request) || (await usuarioLogado()) !== null;
  if (!autorizado) {
    return Response.json({ error: "nao autorizado" }, { status: 401 });
  }

  return Response.json({ error: "nao implementado" }, { status: 501 });
}
