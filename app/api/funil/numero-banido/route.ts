// CSV do filtro "Número banido" do Funil (nome, telefone, etapa, vendedor, número antigo), para
// retomar os leads por outro número. Só admin (o telefone do lead só o admin lê).
// /api passa pelo proxy sem exigir login: a rota confere sozinha quem chamou.
// GET /api/funil/numero-banido?v=<atendente da Data Crazy, opcional>

import { usuarioLogado } from "@/lib/auth/papeis";
import { contatosDosLeads, csvLeadsBanidos, leadsEmNumeroBanido, opcoesDoFunil } from "@/modulos/funil/dados";

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET(request: Request) {
  const usuario = await usuarioLogado();
  if (!usuario) return texto("Faça login.", 401);
  if (usuario.papel !== "admin") return texto("Só admin pode exportar.", 403);

  const v = new URL(request.url).searchParams.get("v");
  const atendenteId = v && (await opcoesDoFunil()).vendedores.some((o) => o.id === v) ? v : null;
  const itens = await leadsEmNumeroBanido({ atendenteId });
  const contatos = await contatosDosLeads(itens.map((e) => e.leadId).filter((id): id is string => !!id));

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Response(csvLeadsBanidos(itens, contatos), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-numero-banido-${hoje}.csv"`,
      "cache-control": "no-store",
    },
  });
}
