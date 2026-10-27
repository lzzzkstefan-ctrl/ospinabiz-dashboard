import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { hojeSP, lerPeriodo, type Periodo } from "@/modulos/funil/calculo";
import { carregarCustoFluxos } from "@/modulos/funil/custo";
import { custoPorDia, custoPorFluxo, type CustoDoFluxo } from "@/modulos/funil/custo-fluxos";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

// Custo por funil (custo por automação), só admin. Contas em modulos/funil/custo-fluxos.ts;
// regras em docs/modulos/funil.md ("Custo por automação").

type Busca = { p?: string; de?: string; ate?: string; f?: string };
type Props = { searchParams: Promise<Busca> };

export default function CustoFluxosPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/funil/custo" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
          ← Custo de mensagens
        </Link>
        <h1 className="mt-1 text-[28px] leading-tight">Custo por funil</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">
          Quanto cada automação da Data Crazy gasta em mensagens, e as mensagens manuais de cada vendedor. Clique numa linha para ver o custo por dia.
        </p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const PERIODOS: { id: Periodo; nome: string }[] = [
  { id: "hoje", nome: "Hoje" },
  { id: "7d", nome: "7 dias" },
  { id: "30d", nome: "30 dias" },
  { id: "mes", nome: "Mês" },
];

const inteiro = (n: number) => n.toLocaleString("pt-BR");
const umaCasa = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const somarDia = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") notFound();
  const sp = await searchParams;
  const { periodo, desde, ate } = lerPeriodo(sp.p, sp.de, sp.ate, hojeSP());
  const t = await carregarCustoFluxos(desde, ate);
  const moeda = (n: number | null, casas = 2) =>
    n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: t.config.moeda, minimumFractionDigits: casas, maximumFractionDigits: casas });

  const comprou = (id: string) => t.compradores.has(id);
  const linhas = custoPorFluxo(t.linhas, t.config.preco, comprou, t.atendentes);
  const automacoes = linhas.filter((l) => l.tipo !== "manual");
  const manuais = linhas.filter((l) => l.tipo === "manual");
  const total = linhas.reduce((s, l) => s + l.custo, 0);
  const escolhida = linhas.find((l) => l.chave === sp.f) ?? null;

  const link = (q: Record<string, string | null>) => {
    const u = new URLSearchParams();
    u.set("p", periodo);
    if (periodo === "personalizado") {
      u.set("de", desde);
      u.set("ate", ate);
    }
    for (const [k, v] of Object.entries(q)) if (v) u.set(k, v);
    return `/funil/custo/fluxos?${u.toString()}`;
  };

  const dias: string[] = [];
  for (let d = desde; d <= ate; d = somarDia(d, 1)) dias.push(d);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link
              key={p.id}
              href={`/funil/custo/fluxos?p=${p.id}${escolhida ? `&f=${encodeURIComponent(escolhida.chave)}` : ""}`}
              aria-current={periodo === p.id ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                periodo === p.id ? "bg-accent/15 text-white" : "text-ink-dim hover:text-white",
              )}
            >
              {p.nome}
            </Link>
          ))}
        </nav>
        <span className="text-[12px] text-ink-faint">
          {moeda(total)} no período · {moeda(t.config.preco, 3)} por mensagem cobrada ·{" "}
          <Link href="/funil/custo/mapa" className="underline-offset-4 hover:underline">
            Mapa do funil (custo previsto)
          </Link>
        </span>
      </div>

      {escolhida && <Detalhe f={escolhida} serie={custoPorDia(t.linhas, escolhida.chave, t.config.preco, dias)} moeda={moeda} fechar={link({})} />}

      <Tabela titulo="Automações" itens={automacoes} moeda={moeda} link={(c) => link({ f: c })} escolhida={escolhida?.chave ?? null} />
      <Tabela titulo="Mensagens manuais (por vendedor)" itens={manuais} moeda={moeda} link={(c) => link({ f: c })} escolhida={escolhida?.chave ?? null} />

      <p className="m-0 text-[12px] text-ink-faint">
        Automação = o nome do fluxo que a Data Crazy manda em cada mensagem (a API não manda o id: renomear o fluxo cria uma linha nova). Manual = mensagem de
        atendente pelo CRM (inclui mensagem rápida). “Estimado” = mensagem sem fluxo e sem atendente (enviada pelo celular): entra pela etapa do lead naquele momento.
        Custo = mensagens cobradas × preço (as da franquia grátis custam zero). Compraram = leads que passaram por ela e compraram (Hubla ou Pix/CNPJ), a qualquer
        momento. Número interno (teste) fica fora.
      </p>
    </>
  );
}

type Moeda = (n: number | null, casas?: number) => string;

function Tabela({ titulo, itens, moeda, link, escolhida }: { titulo: string; itens: CustoDoFluxo[]; moeda: Moeda; link: (chave: string) => string; escolhida: string | null }) {
  return (
    <section className="glass-lite glass-static p-4">
      <h2 className="m-0 text-[15px] font-semibold text-white">{titulo}</h2>
      {!itens.length ? (
        <p className="m-0 mt-2 text-[13px] italic text-ink-faint">Nenhuma mensagem no período.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{titulo.startsWith("Automa") ? "Automação" : "Vendedor"}</th>
                <th className="py-1.5 pr-3 text-right font-medium">Mensagens</th>
                <th className="py-1.5 pr-3 text-right font-medium">Leads</th>
                <th className="py-1.5 pr-3 text-right font-medium">Por lead</th>
                <th className="py-1.5 pr-3 text-right font-medium">Custo total</th>
                <th className="py-1.5 pr-3 text-right font-medium">Custo por lead</th>
                <th className="py-1.5 text-right font-medium">Compraram</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((l) => (
                <tr key={l.chave} className={cn("border-t border-line-soft text-ink", escolhida === l.chave && "bg-accent/10")}>
                  <td className="py-1.5 pr-3">
                    <Link href={`${link(l.chave)}#detalhe`} className="underline-offset-4 hover:underline">
                      {l.nome}
                    </Link>
                    {l.tipo === "estimado" && <span className="ml-2 text-[11px] text-[rgb(var(--tag-laranja))]">estimado</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{inteiro(l.mensagens)}</td>
                  <td className="py-1.5 pr-3 text-right">{inteiro(l.leads)}</td>
                  <td className="py-1.5 pr-3 text-right">{umaCasa(l.porLead)}</td>
                  <td className="py-1.5 pr-3 text-right text-white">{moeda(l.custo)}</td>
                  <td className="py-1.5 pr-3 text-right">{moeda(l.custoPorLead, 3)}</td>
                  <td className="py-1.5 text-right">
                    {l.compraram}
                    {l.leads > 0 && <span className="ml-1 text-[11.5px] text-ink-faint">({Math.round((l.compraram / l.leads) * 100)}%)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Detalhe({ f, serie, moeda, fechar }: { f: CustoDoFluxo; serie: { dia: string; mensagens: number; custo: number }[]; moeda: Moeda; fechar: string }) {
  const max = Math.max(0.0001, ...serie.map((d) => d.custo));
  const passo = Math.max(1, Math.ceil(serie.length / 8));
  return (
    <section id="detalhe" className="glass-lite glass-static scroll-mt-28 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[15px] font-semibold text-white">
          {f.nome} · custo por dia{f.tipo === "estimado" && <span className="ml-2 text-[11px] text-[rgb(var(--tag-laranja))]">estimado</span>}
        </h2>
        <Link href={fechar} className="text-[12px] text-ink-dim underline-offset-4 hover:underline">
          fechar
        </Link>
      </div>
      <p className="m-0 mt-1 text-[12.5px] text-ink-dim">
        {moeda(f.custo)} no período · <span className="text-white">{moeda(f.custoSemCompra)}</span> com leads que nunca compraram (
        {f.custo > 0 ? Math.round((f.custoSemCompra / f.custo) * 100) : 0}%) · {f.compraram} de {f.leads} leads compraram
      </p>
      <figure className="m-0 mt-4">
        <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={`Custo por dia de ${f.nome}`}>
          {serie.map((d) => (
            <div key={d.dia} className="group relative flex h-full flex-1 items-end">
              <div className="w-full rounded-t-sm bg-accent/70 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(d.custo > 0 ? 2 : 0, (d.custo / max) * 100)}%` }} />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-bg-raised-2 px-2 py-1 text-[11.5px] text-ink group-hover:block">
                {diaCurto(d.dia)}: {moeda(d.custo)} · {inteiro(d.mensagens)} mensagens
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-[3px] text-[10.5px] text-ink-faint">
          {serie.map((d, i) => (
            <span key={d.dia} className="flex-1 text-center">
              {i % passo === 0 || i === serie.length - 1 ? diaCurto(d.dia) : ""}
            </span>
          ))}
        </div>
      </figure>
    </section>
  );
}
