import { mesCapitalizado, resumirLI } from "@/modulos/vendas/lock-in";
import { buscarMesPublico } from "@/modulos/vendas/tela";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatBRLServidor } from "../../(painel)/vendas/_lockin/formato";
import { ListaPublica } from "./lista-publica";

// Link público do mês de um vendedor: só leitura, sem login (liberado no proxy).
// Lido na hora: link desativado no painel → 404 no próximo acesso. Não indexar.
export const metadata: Metadata = {
  title: "Vendas do mês",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default function MesPublicoPage({ params }: { params: Promise<{ codigo: string }> }) {
  return (
    <main className="mx-auto max-w-[1000px] px-4 py-8">
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo params={params} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const dados = await buscarMesPublico(codigo);
  if (!dados) notFound();

  const r = resumirLI(dados.vendas, dados.tickets);
  const margem = dados.margem;
  const [ano] = dados.mes.split("-");
  const totais = [
    { lbl: "faturamento bruto", num: formatBRLServidor(r.bruto) },
    { lbl: "vendas aprovadas", num: String(r.qtd) },
    { lbl: margem ? `comissão (${margem}%)` : "comissão (% a definir)", num: margem ? formatBRLServidor(r.comissao[margem]) : "—" },
    { lbl: "reembolsos", num: String(r.reembolsos) },
    { lbl: "chargebacks", num: String(r.chargebacks) },
  ];

  return (
    <>
      <header className="mb-6">
        <p className="text-[12.5px] text-ink-dim">Fechamento</p>
        <h1 className="text-[26px] text-white sm:text-[28px]">
          Vendas de {mesCapitalizado(dados.mes)} {ano}
        </h1>
      </header>
      <section className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {totais.map((c) => (
          <div key={c.lbl} className="rounded-2xl border border-line-soft bg-bg-raised-2 p-4">
            <span className="block text-[20px] font-semibold leading-none tabular-nums text-white">{c.num}</span>
            <span className="mt-1 block text-xs text-ink-dim">{c.lbl}</span>
          </div>
        ))}
      </section>
      <p className="mb-5 text-[12px] text-ink-faint">
        Vendas aprovadas = pagas no mês
        {r.semTicketProduto > 0 && ` (inclui ${r.semTicketProduto} sem comissão, listadas no fim)`}. Reembolso e chargeback não contam venda nem comissão.
      </p>
      <ListaPublica vendas={dados.publicas} nomeArquivo={`vendas-${dados.mes}.csv`} />
    </>
  );
}
