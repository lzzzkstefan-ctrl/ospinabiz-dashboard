// run-test: envia o template de teste para os 18 numeros monitorados.
// Chamada pelo pg_cron (7h30 e 17h, America/Sao_Paulo) e pelo botao "rodar teste".
// Ver docs/monitor.md. Ainda nao implementado: depende das pendencias do Monitor.

Deno.serve(() =>
  new Response(JSON.stringify({ error: "nao implementado" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  })
);
