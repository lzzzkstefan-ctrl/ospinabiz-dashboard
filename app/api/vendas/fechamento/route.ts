// CSV do fechamento do mês de um vendedor (pro Rodrigo). Só admin.
// /api passa pelo proxy sem exigir login: a rota confere sozinha quem chamou.
// GET /api/vendas/fechamento?mes=AAAA-MM&vendedor=<id>

import { usuarioLogado } from "@/lib/auth/papeis";
import { carregarRelatorio, csvDoFechamento, lerParametrosRelatorio } from "@/modulos/vendas/fechamento";
import { nomeDoMes } from "@/modulos/vendas/regras";

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(request: Request) {
  const usuario = await usuarioLogado();
  if (!usuario) return texto("Faça login.", 401);
  if (usuario.vendas !== "chefe") return texto("Só o chefe de Vendas pode exportar.", 403);

  const url = new URL(request.url);
  const p = lerParametrosRelatorio(url.searchParams.get("mes"), url.searchParams.get("vendedor"));
  if (!p) return texto("Mês ou vendedor inválido.", 400);

  const rel = await carregarRelatorio(p.mes, p.vendedorId);
  if (!rel) return texto("Esse mês ainda não foi fechado para esse vendedor.", 404);
  if (rel.desatualizado) return texto("As vendas mudaram depois do fechamento. Atualize o fechamento antes de exportar.", 409);

  const csv = csvDoFechamento(rel.vendedor, nomeDoMes(p.mes), rel.faixa, rel.dados.resumo, rel.linhas);
  const arquivo = `fechamento-${p.mes}-${rel.vendedor.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${arquivo}"`,
      "cache-control": "no-store",
    },
  });
}
