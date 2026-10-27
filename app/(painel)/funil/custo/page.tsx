import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { hojeSP, lerPeriodo, type Periodo } from "@/modulos/funil/calculo";
import { carregarCusto, type DiaComparado, type FranquiaNumero } from "@/modulos/funil/custo";
import type { Produto, ResultadoCusto } from "@/modulos/funil/custo-calculo";
import { nomesDosNumeros, opcoesDoFunil } from "@/modulos/funil/dados";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

// Custo de mensagens do WhatsApp API oficial (só admin). Contas em modulos/funil/custo-calculo.ts;
// regras em docs/modulos/funil.md ("Custo de mensagens").

type Busca = { p?: string; de?: string; ate?: string; v?: string; prod?: string };
type Props = { searchParams: Promise<Busca> };

export default function CustoMensagensPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/funil" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
          ← Funil
        </Link>
        <h1 className="mt-1 text-[28px] leading-tight">Custo de mensagens</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">
          Mensagens enviadas pela empresa no WhatsApp API oficial (a Meta cobra cada uma entregue). Lidas da Data Crazy a cada 15 minutos, sem o texto.
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
  { id: "personalizado", nome: "Personalizado" },
];

const campo = "rounded-lg border border-line bg-bg-raised-2 px-2.5 py-1.5 text-[13px] text-ink [color-scheme:dark]";
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const inteiro = (n: number) => n.toLocaleString("pt-BR");
const umaCasa = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const hora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") notFound();
  const sp = await searchParams;
  const hoje = hojeSP();
  const { periodo, desde, ate } = lerPeriodo(sp.p, sp.de, sp.ate, hoje);
  const opcoes = await opcoesDoFunil();
  const atendenteId = opcoes.vendedores.some((v) => v.id === sp.v) ? sp.v! : null;
  const produto: Produto | null = sp.prod === "gcs" || sp.prod === "viral" ? sp.prod : null;

  const [t, numeros] = await Promise.all([carregarCusto({ desde, ate, atendenteId, produto }), nomesDosNumeros()]);
  const r = t.resultado;
  const moeda = (n: number | null, casas = 2) =>
    n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: t.config.moeda, minimumFractionDigits: casas, maximumFractionDigits: casas });

  const filtros = new URLSearchParams();
  if (atendenteId) filtros.set("v", atendenteId);
  if (produto) filtros.set("prod", produto);
  const linkPeriodo = (p: Periodo) => {
    const q = new URLSearchParams(filtros);
    q.set("p", p);
    if (p === "personalizado") {
      q.set("de", desde);
      q.set("ate", ate);
    }
    return `/funil/custo?${q.toString()}`;
  };

  const precoTexto = moeda(t.config.preco, 3);

  return (
    <>
      {/* filtros */}
      <section className="flex flex-col gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link
              key={p.id}
              href={linkPeriodo(p.id)}
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
        <form method="get" action="/funil/custo" className="flex flex-wrap items-end gap-3 text-xs text-ink-dim">
          <input type="hidden" name="p" value={periodo} />
          {periodo === "personalizado" && (
            <>
              <label className="flex flex-col gap-1">
                De
                <input type="date" name="de" defaultValue={desde} max={hoje} className={campo} />
              </label>
              <label className="flex flex-col gap-1">
                Até
                <input type="date" name="ate" defaultValue={ate} max={hoje} className={campo} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 font-medium text-ink">
            Vendedor (atendente)
            <select name="v" defaultValue={atendenteId ?? ""} className={cn(campo, "min-w-[180px]")}>
              <option value="">Todos</option>
              {opcoes.vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-medium text-ink">
            Produto
            <select name="prod" defaultValue={produto ?? ""} className={cn(campo, "min-w-[140px]")}>
              <option value="">Todos</option>
              <option value="gcs">GCS</option>
              <option value="viral">Protocolo Viral</option>
            </select>
          </label>
          <button type="submit" className="rounded-full border border-line px-4 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:text-white">
            Aplicar
          </button>
          <span className="self-center text-[12px] text-ink-faint">
            {desde === ate ? dataBR(desde) : `${dataBR(desde)} a ${dataBR(ate)}`} · {precoTexto} por mensagem cobrada ·{" "}
            <Link href="/funil/config#custo" className="underline-offset-4 hover:underline">
              configurar
            </Link>
          </span>
        </form>
        <AvisoLeitura pendentes={t.conversasPendentes} primeiraLida={t.primeiraLida} />
        <nav className="flex flex-wrap gap-4 text-[12.5px]">
          <Link href={`/funil/custo/fluxos?p=${periodo === "personalizado" ? "7d" : periodo}`} className="text-ink-dim underline-offset-4 hover:text-white hover:underline">
            Custo por funil (por automação) →
          </Link>
          <Link href="/funil/custo/mapa" className="text-ink-dim underline-offset-4 hover:text-white hover:underline">
            Mapa do funil (custo previsto) →
          </Link>
        </nav>
      </section>

      {/* números principais */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Numero rotulo="Custo no período" valor={moeda(r.custo)} detalhe={`${inteiro(r.cobradas)} cobradas de ${inteiro(r.mensagens)} enviadas`} />
        <Numero
          rotulo="Custo por venda"
          valor={moeda(r.custoPorVenda.total)}
          detalhe={`${r.vendas.total} venda${r.vendas.total === 1 ? "" : "s"} · GCS ${moeda(r.custoPorVenda.gcs)} · Viral ${moeda(r.custoPorVenda.viral)}`}
        />
        <Numero rotulo="% do faturamento" valor={pct(r.pctFaturamento)} detalhe={`faturamento ${moeda(r.faturamento)} (valor pago das vendas)`} />
        <Numero rotulo="Custo por lead que entrou" valor={moeda(r.custoPorLeadQueEntrou)} detalhe={`${inteiro(r.leadsQueEntraram)} leads entraram no período`} />
        <Numero
          rotulo="Custo por lead que comprou"
          valor={moeda(r.custoPorComprador)}
          detalhe={`${r.compradores} comprador${r.compradores === 1 ? "" : "es"} · mensagens até a compra: média ${umaCasa(r.mensagensAteCompra.media)}, mediana ${umaCasa(r.mensagensAteCompra.mediana)}`}
        />
      </section>

      <PorEtapa r={r} moeda={moeda} />

      <div className="grid gap-4 lg:grid-cols-2">
        <GratisCobrado r={r} moeda={moeda} franquia={t.config.franquia} />
        <QuemMandou r={r} moeda={moeda} />
      </div>

      <PorOrigem r={r} moeda={moeda} />
      <Franquias itens={t.franquias} numeros={numeros} franquia={t.config.franquia} />
      <Comparacao dias={t.comparacao} temReal={t.temCustoReal} moeda={moeda} />

      <p className="m-0 text-[12px] text-ink-faint">
        Como conta: custo = mensagens cobradas × preço. Cobrada = entregue (ou lida), depois da franquia do mês do número (contada na ordem de envio, mês em UTC como a Meta) e
        fora da janela grátis de anúncio (só lead que veio de anúncio Click-to-WhatsApp). Mensagem para número interno (teste) fica fora das contas por lead. Etapa = a última
        etiqueta de etapa colocada antes do envio; depois da compra, “Comprou”. O filtro de vendedor usa o dono do lead; o de produto vale para vendas, faturamento e
        compradores (o custo das mensagens é o mesmo). Vendas = pagas no período (sem teste).
      </p>
    </>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="glass-lite glass-static flex flex-col gap-1 p-4">
      <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">{rotulo}</p>
      <p className="text-[26px] font-semibold tabular-nums text-white">{valor}</p>
      {detalhe && <p className="text-[12px] text-ink-dim">{detalhe}</p>}
    </div>
  );
}

function AvisoLeitura({ pendentes, primeiraLida }: { pendentes: number; primeiraLida: string | null }) {
  if (!primeiraLida) return <p className="m-0 text-[12.5px] text-[rgb(var(--tag-laranja))]">Ainda nenhuma mensagem lida. A sincronização começa a ler na próxima rodada.</p>;
  return (
    <p className="m-0 text-[12px] text-ink-faint">
      Mensagens lidas desde {hora(primeiraLida)}.
      {pendentes > 0 && (
        <span className="text-[rgb(var(--tag-laranja))]"> Faltam ler {inteiro(pendentes)} conversas (a sincronização lê até 150 por rodada): os números ainda vão subir.</span>
      )}
    </p>
  );
}

type Moeda = (n: number | null, casas?: number) => string;

function Secao({ id, titulo, children, legenda }: { id?: string; titulo: string; legenda?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="glass-lite glass-static scroll-mt-28 p-4">
      <h2 className="m-0 text-[15px] font-semibold text-white">{titulo}</h2>
      {legenda && <p className="m-0 mt-1 text-[12px] text-ink-faint">{legenda}</p>}
      <div className="mt-3 overflow-x-auto">{children}</div>
    </section>
  );
}

const th = "py-1.5 pr-3 font-medium";
const thNum = "py-1.5 pr-3 text-right font-medium";
const td = "py-1.5 pr-3";
const tdNum = "py-1.5 pr-3 text-right";

function PorEtapa({ r, moeda }: { r: ResultadoCusto; moeda: Moeda }) {
  const linhas = r.etapas.filter((e) => e.mensagens > 0 || e.grupo !== "sem_etapa");
  return (
    <Secao titulo="Por etapa" legenda="Mensagens enviadas no período, pela etapa em que o lead estava na hora do envio.">
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <thead className="text-[11.5px] text-ink-dim">
          <tr>
            <th className={th}>Etapa</th>
            <th className={thNum}>Mensagens</th>
            <th className={thNum}>Leads</th>
            <th className={thNum}>Mensagens por lead</th>
            <th className={thNum}>Custo por lead</th>
            <th className="py-1.5 text-right font-medium">Custo total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((e) => (
            <tr key={e.grupo} className="border-t border-line-soft text-ink">
              <td className={cn(td, e.grupo === "sem_etapa" && "text-ink-dim")}>{e.nome}</td>
              <td className={tdNum}>{inteiro(e.mensagens)}</td>
              <td className={tdNum}>{inteiro(e.leads)}</td>
              <td className={tdNum}>{umaCasa(e.porLead)}</td>
              <td className={tdNum}>{moeda(e.custoPorLead, 3)}</td>
              <td className="py-1.5 text-right text-white">{moeda(e.custo)}</td>
            </tr>
          ))}
          <tr className="border-t border-line text-white">
            <td className={cn(td, "font-medium")}>Total</td>
            <td className={tdNum}>{inteiro(r.mensagens)}</td>
            <td className={tdNum} />
            <td className={tdNum} />
            <td className={tdNum} />
            <td className="py-1.5 text-right font-medium">{moeda(r.custo)}</td>
          </tr>
        </tbody>
      </table>
    </Secao>
  );
}

function GratisCobrado({ r, moeda, franquia }: { r: ResultadoCusto; moeda: Moeda; franquia: number }) {
  const linhas = [
    { nome: "Cobradas", qtd: r.porCobranca.cobrada, valor: r.custo },
    { nome: `Franquia do mês (${inteiro(franquia)} por número)`, qtd: r.porCobranca.franquia, valor: 0 },
    { nome: "Grátis de anúncio (Click-to-WhatsApp)", qtd: r.porCobranca.gratis_anuncio, valor: 0 },
    { nome: "Não entregues (não cobradas)", qtd: r.porCobranca.nao_cobrada, valor: 0 },
  ];
  return (
    <Secao titulo="Grátis × cobrado">
      <Tabela2 linhas={linhas.map((l) => ({ ...l, pct: r.mensagens ? l.qtd / r.mensagens : null }))} moeda={moeda} />
    </Secao>
  );
}

function QuemMandou({ r, moeda }: { r: ResultadoCusto; moeda: Moeda }) {
  const linhas = [
    { nome: "Automação (fluxos da Data Crazy)", qtd: r.porQuem.automacao, valor: r.custoPorQuem.automacao },
    { nome: "Atendente (pelo CRM)", qtd: r.porQuem.atendente, valor: r.custoPorQuem.atendente },
    { nome: "Celular (app do WhatsApp, sem atendente nem fluxo)", qtd: r.porQuem.celular, valor: r.custoPorQuem.celular },
  ];
  const tipos = Object.entries(r.porTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, n]) => `${tipo} ${inteiro(n)}`)
    .join(" · ");
  return (
    <Secao titulo="Automação × atendente" legenda={tipos ? `Por tipo: ${tipos}` : undefined}>
      <Tabela2 linhas={linhas.map((l) => ({ ...l, pct: r.mensagens ? l.qtd / r.mensagens : null }))} moeda={moeda} />
    </Secao>
  );
}

function Tabela2({ linhas, moeda }: { linhas: { nome: string; qtd: number; pct: number | null; valor: number }[]; moeda: Moeda }) {
  return (
    <table className="w-full border-collapse text-left text-[13px] tabular-nums">
      <thead className="text-[11.5px] text-ink-dim">
        <tr>
          <th className={th} />
          <th className={thNum}>Mensagens</th>
          <th className={thNum}>%</th>
          <th className="py-1.5 text-right font-medium">Custo</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.nome} className="border-t border-line-soft text-ink">
            <td className={td}>{l.nome}</td>
            <td className={tdNum}>{inteiro(l.qtd)}</td>
            <td className={cn(tdNum, "text-ink-dim")}>{pct(l.pct)}</td>
            <td className="py-1.5 text-right text-white">{moeda(l.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PorOrigem({ r, moeda }: { r: ResultadoCusto; moeda: Moeda }) {
  const nome = { link: "Link / redirecionador", ctwa: "Anúncio Click-to-WhatsApp" } as const;
  return (
    <Secao
      titulo="Por origem do lead"
      legenda="Click-to-WhatsApp = a conversa veio com o id do anúncio (a Data Crazy informa); o resto é link. Custo por compra = custo das mensagens dos leads da origem ÷ compradores da origem no período."
    >
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <thead className="text-[11.5px] text-ink-dim">
          <tr>
            <th className={th}>Origem</th>
            <th className={thNum}>Leads que entraram</th>
            <th className={thNum}>Mensagens</th>
            <th className={thNum}>Custo</th>
            <th className={thNum}>Compras</th>
            <th className="py-1.5 text-right font-medium">Custo por compra</th>
          </tr>
        </thead>
        <tbody>
          {r.porOrigem.map((o) => (
            <tr key={o.origem} className="border-t border-line-soft text-ink">
              <td className={td}>{nome[o.origem]}</td>
              <td className={tdNum}>{inteiro(o.leads)}</td>
              <td className={tdNum}>{inteiro(o.mensagens)}</td>
              <td className={tdNum}>{moeda(o.custo)}</td>
              <td className={tdNum}>{o.compras}</td>
              <td className="py-1.5 text-right text-white">{moeda(o.custoPorCompra)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Secao>
  );
}

function Franquias({ itens, numeros, franquia }: { itens: FranquiaNumero[]; numeros: Map<string, string>; franquia: number }) {
  if (!itens.length) return null;
  const mesBR = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
  return (
    <Secao titulo="Franquia grátis por número" legenda={`As primeiras ${inteiro(franquia)} mensagens entregues de cada número no mês saem de graça; depois disso, tudo é cobrado.`}>
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <thead className="text-[11.5px] text-ink-dim">
          <tr>
            <th className={th}>Mês</th>
            <th className={th}>Número</th>
            <th className={thNum}>Entregues no mês</th>
            <th className="py-1.5 text-right font-medium">Franquia acabou</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((f) => (
            <tr key={`${f.mes}-${f.numeroId}`} className="border-t border-line-soft text-ink">
              <td className={td}>{mesBR(f.mes)}</td>
              <td className={td}>{f.numeroId ? (numeros.get(f.numeroId) ?? "número sem cadastro") : "sem número"}</td>
              <td className={tdNum}>{inteiro(f.contadas)}</td>
              <td className="py-1.5 text-right text-white">{f.acabouEm ? hora(f.acabouEm) : `ainda não (faltam ${inteiro(Math.max(0, franquia - f.contadas))})`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Secao>
  );
}

function Comparacao({ dias, temReal, moeda }: { dias: DiaComparado[]; temReal: boolean; moeda: Moeda }) {
  return (
    <Secao
      id="comparacao"
      titulo="Estimado (Data Crazy) × real (Meta)"
      legenda={
        temReal
          ? "Por dia em UTC (o dia da Meta), da operação inteira (sem filtros). O real vem da Meta na moeda da conta."
          : "O custo real da Meta ainda não está ligado: falta o token META_CUSTO_TOKEN no servidor (ver docs/modulos/funil.md). Por enquanto só o estimado."
      }
    >
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <thead className="text-[11.5px] text-ink-dim">
          <tr>
            <th className={th}>Dia (UTC)</th>
            <th className={thNum}>Cobradas (estimado)</th>
            <th className={thNum}>Estimado</th>
            <th className={thNum}>Real (Meta)</th>
            <th className="py-1.5 text-right font-medium">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.dia} className="border-t border-line-soft text-ink">
              <td className={td}>{dataBR(d.dia)}</td>
              <td className={tdNum}>{inteiro(d.cobradas)}</td>
              <td className={tdNum}>{moeda(d.estimado)}</td>
              <td className={tdNum}>{d.real === null ? "—" : `${moeda(d.real)}${d.moedaMeta && d.moedaMeta !== "BRL" ? ` ${d.moedaMeta}` : ""}`}</td>
              <td className="py-1.5 text-right text-white">{d.real === null ? "—" : moeda(d.real - d.estimado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Secao>
  );
}
