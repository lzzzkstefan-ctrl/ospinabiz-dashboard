// Webhook da Meta para o monitor.
// GET: verificação do webhook (hub.challenge com META_WEBHOOK_VERIFY_TOKEN).
// POST: status das mensagens (sent/delivered/read/failed) e respostas "ok" da Data Crazy.
//       Conferir assinatura X-Hub-Signature-256 com META_APP_SECRET antes de processar.
// Regras ficam em modulos/monitor/processar-status.ts. Aqui só recebe e repassa.

export function GET() {
  return Response.json({ error: "nao implementado" }, { status: 501 });
}

export function POST() {
  return Response.json({ error: "nao implementado" }, { status: 501 });
}
