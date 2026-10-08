import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { listarVendedores, margemDoMes } from "@/modulos/vendas/dados";
import { resumirLI, resumoAnual } from "@/modulos/vendas/lock-in";
import { diaSP, FAIXAS, lerMes, mesDe, somarMes, type Faixa } from "@/modulos/vendas/regras";
import {
  carregarVendas,
  faixasSugeridas,
  listarAdiantamentos,
  listarFechamentosLI,
  listarPlataformas,
  listarTicketsLI,
  mesDoVendedor,
  whatsappFechamento,
} from "@/modulos/vendas/tela";
import Link from "next/link";
import { Suspense } from "react";
import { formatBRLServidor } from "./_lockin/formato";
import { PainelVendas, type VerLista } from "./_lockin/painel";
import { ResumoAnual } from "./_lockin/resumo-anual";

type Busca = { v?: string; visao?: string; mes?: string; ver?: string; ano?: string };
type Props = { searchParams: Promise<Busca> };

// Vendas no formato do Lock in (masterview), por vendedor.
// Admin: seletor Davi | Vyenna | Geral, com a tela completa de cada um.
// Vendedor: a mesma tela, só com os dados dele (o RLS do banco garante), sem seletor.
export default function VendasPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] leading-tight">Vendas</h1>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const um = (x: string | string[] | undefined) => (typeof x === "string" ? x : undefined);

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario) return null;
  const sp = await searchParams;
  const admin = usuario.papel === "admin";
  const hoje = diaSP(new Date())!;
  const mesAtual = mesDe(hoje);
  const mes = lerMes(um(sp.mes), mesAtual);
  const ver: VerLista = sp.ver === "reembolso" || sp.ver === "tabela" ? sp.ver : "pago";

  const vendedores = (await listarVendedores()).filter((v) => v.ativo);
  const eu = vendedores.find((v) => v.usuario_id === usuario.id) ?? null;
  if (!admin && !eu) return <p className="text-[13.5px] text-ink-dim">Seu login ainda não está ligado a um vendedor. Fale com o admin.</p>;

  // quem está na tela: vendedor escolhido (admin), "geral" (admin) ou o próprio vendedor
  const escolhido = admin ? (sp.v === "geral" ? null : (vendedores.find((v) => String(v.equipe_id) === sp.v) ?? eu ?? vendedores[0] ?? null)) : eu;
  const geral = admin && escolhido === null;
  const visao = !geral && sp.visao === "ano" ? "ano" : "mes";
  const base = `/vendas?v=${geral ? "geral" : escolhido!.equipe_id}`;
  // o vendedor não recebe nem o nome dos outros
  const opcoes = (admin ? vendedores : [eu!]).map((v) => ({ id: v.equipe_id, nome: v.nome }));

  return (
    <>
      {admin && (
        <nav className="flex flex-wrap gap-1.5" aria-label="Vendedor">
          {[...opcoes.map((o) => ({ id: String(o.id), nome: o.nome })), { id: "geral", nome: "Geral" }].map((o) => {
            const ativo = geral ? o.id === "geral" : o.id === String(escolhido?.equipe_id);
            return (
              <Link
                key={o.id}
                href={`/vendas?v=${o.id}&mes=${mes}`}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors",
                  ativo ? "bg-accent text-background" : "border border-line text-ink-dim hover:border-accent hover:text-white",
                )}
              >
                {o.nome}
              </Link>
            );
          })}
          <Link href={`/vendas/config?mes=${mes}`} className="ml-auto self-center text-[12.5px] text-ink-dim underline-offset-4 hover:underline">
            Configuração
          </Link>
        </nav>
      )}

      {!admin && (
        <Link href={`/vendas/config?mes=${mes}`} className="-mt-3 self-start text-[13px] text-ink-dim underline underline-offset-4 hover:text-white">
          Ver configuração e margem do mês
        </Link>
      )}

      {!geral && (
        <nav className="flex flex-wrap gap-1.5 border-b border-line-soft pb-3" aria-label="Visão">
          {[
            { id: "mes", nome: "Mês", href: `${base}&mes=${mes}` },
            { id: "ano", nome: "Resumo anual", href: `${base}&visao=ano&ano=${mes.slice(0, 4)}` },
          ].map((a) => (
            <Link
              key={a.id}
              href={a.href}
              aria-current={visao === a.id ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors",
                visao === a.id ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
              )}
            >
              {a.nome}
            </Link>
          ))}
        </nav>
      )}

      {visao === "ano" ? (
        <Anual vendedorId={escolhido!.equipe_id} ano={Number(um(sp.ano)) || Number(mes.slice(0, 4))} anoAtual={Number(mesAtual.slice(0, 4))} base={base} />
      ) : (
        <Mes
          admin={admin}
          vendedor={geral ? null : { id: escolhido!.equipe_id, nome: escolhido!.nome }}
          opcoes={opcoes}
          mes={mes}
          mesAtual={mesAtual}
          ver={ver}
          hoje={hoje}
          base={base}
        />
      )}
    </>
  );
}

async function Mes({
  admin,
  vendedor,
  opcoes,
  mes,
  mesAtual,
  ver,
  hoje,
  base,
}: {
  admin: boolean;
  vendedor: { id: number; nome: string } | null;
  opcoes: { id: number; nome: string }[];
  mes: string;
  mesAtual: string;
  ver: VerLista;
  hoje: string;
  base: string;
}) {
  const ano = Number(mes.slice(0, 4));
  const fim = `${somarMes(mes, 1)}-01`;
  const [tickets, vendas, margem, mesVend, adiantamentos, fechamentos, whatsapp, plataformas] = await Promise.all([
    listarTicketsLI(),
    carregarVendas(vendedor?.id ?? null, `${mes}-01`, fim),
    // só a faixa sugerida sai daqui (a margem e os custos ficam no servidor)
    margemDoMes(mes).then((m) => m.faixa),
    vendedor ? mesDoVendedor(mes, vendedor.id) : null,
    vendedor ? listarAdiantamentos(vendedor.id, ano) : [],
    vendedor ? listarFechamentosLI(vendedor.id, ano) : [],
    admin && vendedor ? whatsappFechamento() : null,
    listarPlataformas(),
  ]);
  const fechado = fechamentos.find((f) => f.mes === mes) ?? null;
  const margemPadrao: Faixa = fechado?.faixa ?? margem ?? 10;

  return (
    <>
      {!vendedor && <ResumoPorVendedor vendas={vendas} tickets={tickets} opcoes={opcoes} faixa={margem} />}
      <PainelVendas
        admin={admin}
        vendedor={vendedor}
        vendedores={opcoes}
        plataformas={plataformas}
        tickets={tickets}
        vendas={vendas}
        margemPadrao={margemPadrao}
        faixaSugerida={margem}
        mes={mes}
        mesAtual={mesAtual}
        ver={ver}
        hoje={hoje}
        base={base}
        fechamento={
          vendedor && mesVend
            ? {
                observacoesSalvas: mesVend.observacoes,
                codigo: admin ? mesVend.codigo : null,
                whatsapp,
                adiantamentos: adiantamentos.filter((a) => a.mes === mes).map(({ id, valor, data }) => ({ id, valor, data })),
                fechado: fechado ? { faixa: fechado.faixa, quando: fechado.fechado_em, qtd: fechado.qtd, comissao: fechado.comissao } : null,
              }
            : undefined
        }
      />
    </>
  );
}

/** Geral (admin): os dois vendedores lado a lado no mês. */
function ResumoPorVendedor({
  vendas,
  tickets,
  opcoes,
  faixa,
}: {
  vendas: Awaited<ReturnType<typeof carregarVendas>>;
  tickets: Awaited<ReturnType<typeof listarTicketsLI>>;
  opcoes: { id: number; nome: string }[];
  faixa: Faixa | null;
}) {
  const linhas = [
    ...opcoes.map((o) => ({ nome: o.nome, r: resumirLI(vendas.filter((v) => v.vendedor_id === o.id), tickets) })),
    { nome: "Sem vendedor", r: resumirLI(vendas.filter((v) => v.vendedor_id === null), tickets) },
  ].filter((l) => l.r.qtd + l.r.reembolsos + l.r.chargebacks > 0 || l.nome !== "Sem vendedor");
  return (
    <section className="glass-lite glass-static overflow-x-auto p-4">
      <h3 className="mb-3 text-[15px] font-semibold text-white">Por vendedor</h3>
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <thead className="text-[11.5px] text-ink-dim">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Vendedor</th>
            <th className="py-1.5 pr-3 text-right font-medium">Vendas</th>
            <th className="py-1.5 pr-3 text-right font-medium">Bruto</th>
            <th className="py-1.5 pr-3 text-right font-medium">Líquido</th>
            {FAIXAS.map((f) => (
              <th key={f} className={cn("py-1.5 pr-3 text-right font-medium", faixa === f && "text-white")}>
                {f}%
              </th>
            ))}
            <th className="py-1.5 text-right font-medium">Reemb.</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ nome, r }) => (
            <tr key={nome} className="border-t border-line-soft text-ink">
              <td className="py-1.5 pr-3 text-white">{nome}</td>
              <td className="py-1.5 pr-3 text-right">{r.qtd}</td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right">{formatBRLServidor(r.bruto)}</td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right">{formatBRLServidor(r.liquido)}</td>
              {FAIXAS.map((f) => (
                <td key={f} className={cn("whitespace-nowrap py-1.5 pr-3 text-right", faixa === f ? "text-white" : "text-ink-dim")}>
                  {formatBRLServidor(r.comissao[f])}
                </td>
              ))}
              <td className="py-1.5 text-right">{r.reembolsos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 mt-2 text-[11.5px] text-ink-faint">
        {faixa ? `Faixa sugerida pela margem do mês: ${faixa}%.` : "Margem do mês ainda sem sugestão (falta valor em Configuração)."} O % de cada um é escolhido
        no fechamento, na tela dele.
      </p>
    </section>
  );
}

async function Anual({ vendedorId, ano, anoAtual, base }: { vendedorId: number; ano: number; anoAtual: number; base: string }) {
  const [tickets, vendas, fechamentos, sugeridas, adiantamentos] = await Promise.all([
    listarTicketsLI(),
    carregarVendas(vendedorId, `${ano}-01-01`, `${ano + 1}-01-01`),
    listarFechamentosLI(vendedorId, ano),
    faixasSugeridas(ano),
    listarAdiantamentos(vendedorId, ano),
  ]);
  const meses = resumoAnual(ano, vendas, tickets, fechamentos, sugeridas, adiantamentos);
  const anos = Array.from({ length: anoAtual - 2026 + 1 }, (_, i) => 2026 + i);
  return <ResumoAnual ano={ano} anos={anos} meses={meses} base={base} />;
}
