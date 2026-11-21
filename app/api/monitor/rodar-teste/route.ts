// Dispara um teste: envia o template para os 18 números monitorados.
// Chamado por:
//   - pg_cron no Supabase (7h30 e 17h, America/Sao_Paulo), com Authorization: Bearer CRON_SECRET;
//   - botão "rodar teste agora" na tela do monitor (usuário logado).
// Regras ficam em modulos/monitor/enviar-teste.ts.

import { chamadaDoCron } from "@/lib/auth/cron";
import { usuarioLogado } from "@/lib/auth/papeis";
import { ARQUIVADO_EM, soLeitura } from "@/lib/arquivo";

export async function POST(request: Request) {
  // aba arquivada em 21/11/2026: o agendamento foi desligado; se alguém ainda chamar, não faz nada
  if (soLeitura()) return Response.json({ ok: false, arquivado: ARQUIVADO_EM }, { status: 410 });
  const autorizado = chamadaDoCron(request) || (await usuarioLogado()) !== null;
  if (!autorizado) {
    return Response.json({ error: "nao autorizado" }, { status: 401 });
  }

  return Response.json({ error: "nao implementado" }, { status: 501 });
}
