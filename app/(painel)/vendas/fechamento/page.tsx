import { ehAdmin } from "@/lib/auth/papeis";
import { carregarRelatorio, lerParametrosRelatorio } from "@/modulos/vendas/fechamento";
import { nomeDoMes, reais } from "@/modulos/vendas/regras";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotaoImprimir } from "../_componentes/formularios";

type Props = { searchParams: Promise<{ mes?: string | string[]; vendedor?: string | string[] }> };

// Relatório do fechamento (só admin), pronto para imprimir ou salvar em PDF pelo navegador.
// Papel branco e texto preto: sai igual na tela e no papel.
export default function RelatorioFechamentoPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
      <Relatorio searchParams={searchParams} />
    </Suspense>
  );
}

const dataBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

async function Relatorio({ searchParams }: Props) {
  if (!(await ehAdmin())) notFound();
  const sp = await searchParams;
  const p = lerParametrosRelatorio(sp.mes, sp.vendedor);
  if (!p) notFound();
  const rel = await carregarRelatorio(p.mes, p.vendedorId);
  const voltar = `/vendas?mes=${p.mes}&aba=${p.vendedorId}`;

  if (!rel) {
    return <p className="text-[13.5px] text-ink-dim">Esse mês ainda não foi fechado. <Link href={voltar} className="underline">Voltar</Link></p>;
  }
  if (rel.desatualizado) {
    return (
      <p className="text-[13.5px] text-[rgb(var(--tag-laranja))]">
        As vendas mudaram depois do fechamento. Atualize o fechamento antes de gerar o PDF. <Link href={voltar} className="underline">Voltar</Link>
      </p>
    );
  }

  const r = rel.dados.resumo;
  const resumo: [string, string][] = [
    ["Vendas pagas com ticket", String(r.qtd)],
    ...(r.semTicket > 0 ? [["Vendas pagas sem ticket (sem comissão)", String(r.semTicket)] as [string, string]] : []),
    ["Faturamento bruto", reais(r.bruto)],
    ["Líquido", reais(r.liquido)],
    ["Margem de comissão", `${rel.faixa}%`],
    ["Comissão", reais(r.comissao[rel.faixa])],
    ["Reembolsos", String(r.reembolsos)],
    ["Chargebacks", String(r.chargebacks)],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={voltar} className="text-[13px] text-ink-dim underline-offset-4 hover:underline">← Vendas</Link>
        <BotaoImprimir />
        <span className="text-[12.5px] text-ink-faint">Na janela de impressão, escolha &quot;Salvar como PDF&quot;.</span>
      </div>

      <article className="rounded-lg bg-white p-8 text-[13px] text-black print:rounded-none print:p-0">
        <header className="mb-6 border-b border-black/20 pb-4">
          <p className="text-[11px] uppercase tracking-wide text-black/60">Prestação comercial GCS</p>
          <h1 className="text-[22px] font-semibold capitalize">Fechamento de {nomeDoMes(rel.mes)}</h1>
          <p className="text-black/70">
            Vendedor: <b>{rel.vendedor}</b> · Fechado em {dataBR(rel.fechadoEm)}
          </p>
        </header>

        <table className="mb-6 w-full max-w-[420px] tabular-nums">
          <tbody>
            {resumo.map(([rotulo, valor]) => (
              <tr key={rotulo} className="border-b border-black/10">
                <td className="py-1.5 pr-4 text-black/70">{rotulo}</td>
                <td className="py-1.5 text-right font-semibold">{valor}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mb-2 text-[15px] font-semibold">Vendas do mês ({rel.linhas.length})</h2>
        <table className="w-full text-left tabular-nums">
          <thead className="text-[11px] uppercase tracking-wide text-black/60">
            <tr className="border-b border-black/30">
              <th className="py-1.5 pr-3 font-medium">Data</th>
              <th className="py-1.5 pr-3 font-medium">Cliente</th>
              <th className="py-1.5 pr-3 font-medium">Ticket</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 pr-3 text-right font-medium">Bruto</th>
              <th className="py-1.5 pr-3 text-right font-medium">Líquido</th>
              <th className="py-1.5 text-right font-medium">Comissão {rel.faixa}%</th>
            </tr>
          </thead>
          <tbody>
            {rel.linhas.map((l, i) => (
              <tr key={i} className="border-b border-black/10 break-inside-avoid">
                <td className="py-1 pr-3">{l.data} {l.hora}</td>
                <td className="py-1 pr-3">{l.cliente}</td>
                <td className="py-1 pr-3">{l.ticket}</td>
                <td className="py-1 pr-3">{l.status}</td>
                <td className="py-1 pr-3 text-right">{l.bruto === null ? "—" : reais(l.bruto)}</td>
                <td className="py-1 pr-3 text-right">{l.liquido === null ? "—" : reais(l.liquido)}</td>
                <td className="py-1 text-right">{l.comissao === null ? "—" : reais(l.comissao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </div>
  );
}
