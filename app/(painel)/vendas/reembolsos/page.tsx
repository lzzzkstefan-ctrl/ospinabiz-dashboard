import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { listarVendedores } from "@/modulos/vendas/dados";
import { carregarReembolsos } from "@/modulos/vendas/reembolsos";
import { dataCurta, nomeDaLinha, taxasDeReversao, type Reembolso, type TaxaReversao } from "@/modulos/vendas/reembolsos-regras";
import { diaSP, lerMes, mesDe, nomeDoMes, somarMes } from "@/modulos/vendas/regras";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListaPendentes } from "./pendentes";

type Busca = { mes?: string | string[]; id?: string | string[] };
type Props = { searchParams: Promise<Busca> };

// Reembolsos: pedidos de reembolso da Hubla (modulos/vendas/reembolsos.ts). Admin do sistema e chefe
// de Vendas veem todos; o vendedor só os pedidos das vendas dele (o RLS do banco garante o mesmo).
// O push do pedido abre esta tela com ?id=<pedido> (o cartão fica destacado).
export default function ReembolsosPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/vendas" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">← Vendas</Link>
        <h1 className="mt-1 text-[28px] leading-tight">Reembolsos</h1>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">{titulo}</h2>
      {children}
    </section>
  );
}

const um = (x: string | string[] | undefined) => (typeof x === "string" ? x : undefined);
const pct = (t: number | null) => (t === null ? "—" : `${Math.round(t * 100)}%`);

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario) notFound();
  // plantonista não tem Vendas (o proxy já tira da tela; o banco não deixa ler)
  if (usuario.vendas === "nenhum") return <p className="text-[13.5px] text-ink-dim">Reembolsos é só de quem está em Vendas.</p>;
  const sp = await searchParams;
  const mesAtual = mesDe(diaSP(new Date())!);
  const mes = lerMes(um(sp.mes), mesAtual);
  const destaque = Number(um(sp.id)) || null;
  const todos = usuario.papel === "admin" || usuario.vendas === "chefe";

  const [tela, vendedores] = await Promise.all([carregarReembolsos(mes), listarVendedores()]);
  const nomes: Record<number, string> = Object.fromEntries(vendedores.map((v) => [v.equipe_id, v.nome]));
  const nomeVendedor = (r: Reembolso) => (r.vendedor_id ? (nomes[r.vendedor_id] ?? "vendedor") : "sem vendedor");

  return (
    <>
      <p className="-mt-4 text-[13px] text-ink-dim">
        {todos ? "Todos os pedidos de reembolso da Hubla." : "Os pedidos de reembolso das suas vendas."} Na Hubla, o pedido feito dentro da garantia é
        executado sozinho no prazo se ninguém resolver: fale com o cliente e, se ele desistir, peça o cancelamento do pedido e marque aqui como revertido.
      </p>

      <Secao titulo={`Pendentes (${tela.pendentes.length})`}>
        <ListaPendentes pedidos={tela.pendentes} vendedores={nomes} destaque={destaque} />
      </Secao>

      <Secao titulo="Histórico">
        <div className="flex items-center gap-3 text-[13.5px]">
          <Link href={`/vendas/reembolsos?mes=${somarMes(mes, -1)}`} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">←</Link>
          <span className="font-semibold capitalize text-white">{nomeDoMes(mes)}</span>
          <Link href={`/vendas/reembolsos?mes=${somarMes(mes, 1)}`} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">→</Link>
        </div>
        <p className="text-[12.5px] text-ink-dim">
          Pedidos feitos no mês. Taxa de reversão = revertidos ÷ (revertidos + reembolsados); pendente ainda não conta.
        </p>
        {tela.doMes.length === 0 ? (
          <p className="text-[13.5px] text-ink-dim">Nenhum pedido de reembolso em {nomeDoMes(mes)}.</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <TabelaTaxa titulo="Por vendedor" linhas={taxasDeReversao(tela.doMes, nomeVendedor)} />
              <TabelaTaxa titulo="Por produto" linhas={taxasDeReversao(tela.doMes, (r) => nomeDaLinha(r.linha))} />
            </div>
            <div className="glass-lite glass-static overflow-x-auto">
              <table className="w-full text-left text-[13px] tabular-nums">
                <thead className="text-[12px] text-ink-dim">
                  <tr className="border-b border-line-soft">
                    <th className="px-3 py-2 font-medium">Pedido em</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Produto</th>
                    <th className="px-3 py-2 font-medium">Vendedor</th>
                    <th className="px-3 py-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {tela.doMes.map((r) => (
                    <tr key={r.id} className="border-b border-line-soft last:border-0">
                      <td className="whitespace-nowrap px-3 py-2">{dataCurta(r.pedido_em)}</td>
                      <td className="px-3 py-2">{r.cliente_nome ?? "Cliente"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.valor == null ? "—" : `R$ ${Number(r.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</td>
                      <td className="px-3 py-2">{nomeDaLinha(r.linha)}</td>
                      <td className="px-3 py-2">{nomeVendedor(r)}</td>
                      <td className="px-3 py-2">
                        <Situacao r={r} quem={r.revertido_por ? tela.quemReverteu[r.revertido_por] : undefined} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Secao>
    </>
  );
}

function Situacao({ r, quem }: { r: Reembolso; quem?: string }) {
  if (r.status === "pendente") return <Etiqueta cor="laranja">pendente</Etiqueta>;
  if (r.status === "reembolsado") return <Etiqueta cor="vermelho">reembolsado{r.reembolsado_em ? ` ${dataCurta(r.reembolsado_em)}` : ""}</Etiqueta>;
  const por =
    r.revertido_via === "tela"
      ? `por ${quem ?? "alguém da equipe"}`
      : r.hubla_status === "rejected"
        ? "recusado na Hubla"
        : "cliente cancelou na Hubla";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Etiqueta cor="verde">revertido</Etiqueta>
      <span className="text-[12px] text-ink-dim">
        {por}
        {r.revertido_em ? `, ${dataCurta(r.revertido_em)}` : ""}
      </span>
    </span>
  );
}

function TabelaTaxa({ titulo, linhas }: { titulo: string; linhas: TaxaReversao[] }) {
  return (
    <div className="glass-lite glass-static overflow-x-auto p-4">
      <h3 className="mb-2 text-[14px] font-semibold text-white">{titulo}</h3>
      <table className="w-full text-left text-[13px] tabular-nums">
        <thead className="text-[12px] text-ink-dim">
          <tr>
            <th className="py-1 pr-3 font-medium"></th>
            <th className="py-1 pr-3 font-medium">Pedidos</th>
            <th className="py-1 pr-3 font-medium">Revertidos</th>
            <th className="py-1 pr-3 font-medium">Reembolsados</th>
            <th className="py-1 pr-3 font-medium">Pendentes</th>
            <th className="py-1 font-medium">Reversão</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave}>
              <td className="py-1 pr-3 text-white">{l.chave}</td>
              <td className="py-1 pr-3">{l.pedidos}</td>
              <td className="py-1 pr-3">{l.revertidos}</td>
              <td className="py-1 pr-3">{l.reembolsados}</td>
              <td className="py-1 pr-3">{l.pendentes}</td>
              <td className="py-1 font-semibold text-white">{pct(l.taxa)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
