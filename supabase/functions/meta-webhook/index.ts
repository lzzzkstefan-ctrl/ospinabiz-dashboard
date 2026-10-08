// meta-webhook: recebe da Meta o status das mensagens de teste (sent/delivered/failed)
// e as respostas "ok" da Data Crazy. Ver docs/monitor.md.
// Ainda nao implementado: depende das pendencias do Monitor.

Deno.serve(() =>
  new Response(JSON.stringify({ error: "nao implementado" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  })
);
