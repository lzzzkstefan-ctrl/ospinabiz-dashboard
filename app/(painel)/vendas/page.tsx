import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import {
  carregarPainel,
  historicoDoVendedor,
  listarFechamentos,
  listarTickets,
  listarVendedores,
  margemDoMes,
  nomesDosClientes,
  type Fechamento,
  type MesHistorico,
  type Vendedor,
} from "@/modulos/vendas/dados";
import {
  FAIXAS,
  centavos,
  diaSP,
  lerMes,
  mesDe,
  nomeDoMes,
  precisaRevisar,
  precoCurto,
  reais,
  resumir,
  somarMes,
  textoPrestacao,
  type Faixa,
  type Ticket,
  type Venda,
} from "@/modulos/vendas/regras";
import Link from "next/link";
import { Suspense } from "react";
import { AtribuirVenda, CopiarResumo, CorrigirVenda, FecharMes } from "./_componentes/formularios";

type Props = { searchParams: Promise<{ mes?: string | string[]; aba?: string | string[] }> };

// Vendas: admin vê a operação inteira, cada vendedor e fecha o mês de cada um no %
// escolhido; o vendedor vê só os próprios números e o histórico (o RLS do banco garante).
// Regras em modulos/vendas/regras.ts e modulos/vendas/fechamento.ts.
export default function VendasPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] leading-tight">Vendas</h1>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <ConteudoVendas searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const quando = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        .format(new Date(iso))
        .replace(",", "")
    : "—";

const dataCurta = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

type Contexto = {
  admin: boolean;
  mes: string;
  tickets: Ticket[];
  vendedores: Vendedor[];
  clientes: Map<number, string>;
  fechamentos: Fechamento[];
  /** faixa sugerida pela margem da operação (só admin; null = margem ainda incompleta) */
  faixaSugerida: Faixa | null;
};

const fechamentoDe = (ctx: Contexto, vendedorId: number) => ctx.fechamentos.find((f) => f.vendedor_id === vendedorId) ?? null;

async function ConteudoVendas({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario) return null;
  const sp = await searchParams;

  const hoje = diaSP(new Date())!;
  const mesAtual = mesDe(hoje);
  const mes = lerMes(sp.mes, mesAtual);
  const admin = usuario.papel === "admin";

  const [vendedores, tickets, painel, fechamentos, margem] = await Promise.all([
    listarVendedores(),
    listarTickets(),
    carregarPainel(mes, hoje, admin),
    listarFechamentos(mes),
    // a margem usa o faturamento da operação inteira: só o admin vê
    admin ? margemDoMes(mes) : null,
  ]);
  const eu = vendedores.find((v) => v.usuario_id === usuario.id && v.ativo) ?? null;

  if (!admin && !eu) {
    return <p className="text-[13.5px] text-ink-dim">Seu login ainda não está ligado a um vendedor. Fale com o admin.</p>;
  }

  const clientes = admin
    ? await nomesDosClientes([...painel.vendasMes, ...painel.aRevisar].map((v) => v.id))
    : new Map<number, string>();
  const ctx: Contexto = { admin, mes, tickets, vendedores, clientes, fechamentos, faixaSugerida: margem?.faixa ?? null };
  const abaBruta = typeof sp.aba === "string" ? sp.aba : "";
  const vendedorDaAba = admin ? vendedores.find((v) => String(v.equipe_id) === abaBruta) ?? null : eu;
  const historico = vendedorDaAba ? await historicoDoVendedor(vendedorDaAba.equipe_id, tickets) : [];

  return (
    <>
      <SeletorMes mes={mes} mesAtual={mesAtual} aba={abaBruta} />

      {mes === mesAtual && <Hoje vendas={painel.vendasHoje} reembolsos={painel.reembolsosHoje} aRevisar={painel.aRevisar.length} ctx={ctx} />}

      {admin && margem && (
        <p className="text-[13px] text-ink-dim">
          {margem.completa && margem.margemPct !== null ? (
            <>
              Margem de {nomeDoMes(mes)}: <b className="text-white">{margem.margemPct.toFixed(1).replace(".", ",")}%</b> → faixa sugerida{" "}
              <b className="text-white">{margem.faixa}%</b>.
            </>
          ) : (
            <>Margem de {nomeDoMes(mes)} ainda sem sugestão: falta informar gasto em anúncios, imposto Meta ou custo de mensagens.</>
          )}{" "}
          O % de cada vendedor é escolhido no fechamento, na aba dele.{" "}
          <Link href={`/vendas/config?mes=${mes}`} className="underline underline-offset-4">Configuração</Link>
        </p>
      )}

      {admin && <CaixaARevisar vendas={painel.aRevisar} ctx={ctx} />}

      {admin && <Abas mes={mes} atual={vendedorDaAba?.equipe_id ?? null} vendedores={vendedores} />}

      {vendedorDaAba ? (
        <>
          <PainelVendedor
            vendedor={vendedorDaAba}
            vendas={painel.vendasMes.filter((v) => v.vendedor_id === vendedorDaAba.equipe_id)}
            ctx={ctx}
          />
          <Historico historico={historico} mesAtual={mes} aba={admin ? String(vendedorDaAba.equipe_id) : ""} />
        </>
      ) : (
        <Geral vendas={painel.vendasMes} ctx={ctx} />
      )}
    </>
  );
}

function SeletorMes({ mes, mesAtual, aba }: { mes: string; mesAtual: string; aba: string }) {
  const link = (m: string) => `/vendas?mes=${m}${aba ? `&aba=${aba}` : ""}`;
  return (
    <div className="flex items-center gap-3 text-[13.5px]">
      <Link href={link(somarMes(mes, -1))} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">←</Link>
      <span className="font-semibold capitalize text-white">{nomeDoMes(mes)}</span>
      {mes < mesAtual && (
        <Link href={link(somarMes(mes, 1))} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">→</Link>
      )}
    </div>
  );
}

function Card({ rotulo, valor, detalhe, alerta = false }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="glass-lite glass-static flex flex-col gap-1 p-4">
      <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">{rotulo}</p>
      <p className={cn("text-[24px] font-semibold tabular-nums", alerta ? "text-[rgb(var(--tag-laranja))]" : "text-white")}>{valor}</p>
      {detalhe && <p className="text-[12px] text-ink-dim">{detalhe}</p>}
    </div>
  );
}

/** Painel "Hoje". Admin: operação inteira e por vendedor. Vendedor: só o dele (o RLS já filtra). */
function Hoje({ vendas, reembolsos, aRevisar, ctx }: { vendas: Venda[]; reembolsos: Venda[]; aRevisar: number; ctx: Contexto }) {
  const resumo = resumir(vendas, ctx.tickets);
  const porVendedor = ctx.vendedores.map((vend) => ({
    nome: vend.nome,
    r: resumir(vendas.filter((v) => v.vendedor_id === vend.equipe_id), ctx.tickets),
  }));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Hoje</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card rotulo={ctx.admin ? "Faturamento de hoje (geral)" : "Seu faturamento hoje"} valor={reais(resumo.bruto)} />
        <Card
          rotulo="Vendas aprovadas hoje"
          valor={String(resumo.qtd + resumo.semTicket)}
          detalhe={ctx.admin ? porVendedor.map((p) => `${p.nome}: ${p.r.qtd + p.r.semTicket}`).join(" · ") : undefined}
        />
        <Card rotulo="Reembolsos hoje" valor={String(reembolsos.length)} alerta={reembolsos.length > 0} />
        {ctx.admin && <Card rotulo="A revisar" valor={String(aRevisar)} alerta={aRevisar > 0} />}
      </div>
      {ctx.admin && (
        <div className="flex flex-wrap gap-3 text-[13px] text-ink-dim">
          {porVendedor.map((p) => (
            <span key={p.nome}>
              {p.nome}: <b className="text-white">{reais(p.r.bruto)}</b>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function rotuloTicket(ctx: Contexto, ticketId: number | null): string {
  const t = ctx.tickets.find((x) => x.id === ticketId);
  return t ? precoCurto(centavos(t.valor_bruto)) : "sem ticket";
}

const ticketsParaSelect = (ctx: Contexto) =>
  ctx.tickets.map((t) => ({ id: t.id, rotulo: `${precoCurto(centavos(t.valor_bruto))}${t.ativo ? "" : " (inativo)"}` }));

/** Só admin: vendas sem dono (utm desconhecido ou vazio) e vendas novas pagas sem ticket. */
function CaixaARevisar({ vendas, ctx }: { vendas: Venda[]; ctx: Contexto }) {
  if (vendas.length === 0) return null;
  return (
    <section className="glass glass-destaque flex flex-col gap-3 p-5">
      <h2 className="text-[17px]">A revisar · {vendas.length}</h2>
      <p className="text-[12.5px] text-ink-dim">
        Vendas sem vendedor (código do link vazio ou desconhecido) e vendas pagas sem ticket ativo. Nenhuma é descartada.
      </p>
      <ul className="flex flex-col">
        {vendas.map((v) => {
          const semDono = v.vendedor_id === null && !v.sem_vendedor;
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft py-2 last:border-b-0">
              <span className="text-[13px] tabular-nums text-ink-dim">{quando(v.pago_em)}</span>
              <span className="text-[14px] font-semibold text-white">{rotuloTicket(ctx, v.ticket_id)}</span>
              <span className="text-[13px] text-ink-dim">
                {ctx.clientes.get(v.id) ? `${ctx.clientes.get(v.id)} ` : ""}lead final {v.final_lead ?? "?"}
              </span>
              {semDono && <Etiqueta cor="laranja">sem vendedor{v.utm_term ? ` (utm: ${v.utm_term})` : ""}</Etiqueta>}
              {v.ticket_id === null && v.motivo_sem_ticket && <span className="text-[12px] text-[rgb(var(--tag-laranja))]">{v.motivo_sem_ticket}</span>}
              {v.status !== "pago" && <Etiqueta cor="laranja">{v.status}</Etiqueta>}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <AtribuirVenda
                  vendaId={v.id}
                  atual={v.sem_vendedor ? "ninguem" : v.vendedor_id ? String(v.vendedor_id) : "a_atribuir"}
                  vendedores={ctx.vendedores}
                />
              </div>
              <CorrigirVenda vendaId={v.id} ticketId={v.ticket_id} status={v.status} tickets={ticketsParaSelect(ctx)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Abas({ mes, atual, vendedores }: { mes: string; atual: number | null; vendedores: Vendedor[] }) {
  const abas = [{ id: null as number | null, nome: "Geral" }, ...vendedores.map((v) => ({ id: v.equipe_id as number | null, nome: v.nome }))];
  return (
    <nav className="flex flex-wrap gap-1.5 border-b border-line-soft pb-3" aria-label="Abas de vendas">
      {abas.map((a) => (
        <Link
          key={a.nome}
          href={a.id === null ? `/vendas?mes=${mes}` : `/vendas?mes=${mes}&aba=${a.id}`}
          aria-current={atual === a.id ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors",
            atual === a.id ? "bg-accent/15 text-white" : "text-ink-dim hover:bg-bg-raised-2 hover:text-white",
          )}
        >
          {a.nome}
        </Link>
      ))}
    </nav>
  );
}

/** Admin: resumo do mês da operação e de cada vendedor (com o % do fechamento) + todas as vendas. */
function Geral({ vendas, ctx }: { vendas: Venda[]; ctx: Contexto }) {
  const geral = resumir(vendas, ctx.tickets);
  const linhas = [
    ...ctx.vendedores.map((v) => ({
      nome: v.nome,
      r: resumir(vendas.filter((x) => x.vendedor_id === v.equipe_id), ctx.tickets),
      fechamento: fechamentoDe(ctx, v.equipe_id),
    })),
    { nome: "Sem vendedor / a revisar", r: resumir(vendas.filter((x) => x.vendedor_id === null), ctx.tickets), fechamento: null },
  ];
  const sugerida = ctx.faixaSugerida;

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Resumo do mês</h2>
        <div className="rolagem-fina overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="py-2 pr-3 font-medium">Vendedor</th>
                <th className="py-2 pr-3 font-medium">Vendas</th>
                <th className="py-2 pr-3 font-medium">Bruto</th>
                <th className="py-2 pr-3 font-medium">Líquido</th>
                <th className="py-2 pr-3 font-medium">%</th>
                <th className="py-2 pr-3 font-medium">Comissão</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {linhas.map(({ nome, r, fechamento }) => (
                <tr key={nome} className="border-t border-line-soft">
                  <td className="py-2 pr-3 text-white">{nome}</td>
                  <td className="py-2 pr-3">{r.qtd}{r.semTicket > 0 && <span className="text-ink-faint"> +{r.semTicket} sem ticket</span>}</td>
                  <td className="py-2 pr-3">{reais(r.bruto)}</td>
                  <td className="py-2 pr-3">{reais(r.liquido)}</td>
                  <td className="py-2 pr-3">
                    {fechamento ? (
                      <span className="text-white">{fechamento.faixa}% <span className="text-ink-faint">fechado</span></span>
                    ) : sugerida ? (
                      <span className="text-ink-dim">{sugerida}% sugerido</span>
                    ) : (
                      <span className="text-ink-faint">a definir</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {fechamento
                      ? reais(r.comissao[fechamento.faixa])
                      : sugerida
                        ? <span className="text-ink-dim">{reais(r.comissao[sugerida])} (prévia)</span>
                        : `${reais(r.comissao[6])} – ${reais(r.comissao[10])}`}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold text-white">
                <td className="py-2 pr-3">Operação</td>
                <td className="py-2 pr-3">{geral.qtd + geral.semTicket}</td>
                <td className="py-2 pr-3">{reais(geral.bruto)}</td>
                <td className="py-2 pr-3">{reais(geral.liquido)}</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3" />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-ink-faint">
          Reembolsos no mês: {geral.reembolsos} · Chargebacks: {geral.chargebacks}
        </p>
      </section>
      <ListaVendas vendas={vendas} ctx={ctx} mostrarVendedor />
    </>
  );
}

/** Aba do vendedor: totais, comissão no % do fechamento, comparativo 6%–10% e (admin) o fechamento. */
function PainelVendedor({ vendedor, vendas, ctx }: { vendedor: Vendedor; vendas: Venda[]; ctx: Contexto }) {
  const r = resumir(vendas, ctx.tickets);
  const fechamento = fechamentoDe(ctx, vendedor.equipe_id);
  // vendedor vê só o % fechado; o admin vê também a prévia na faixa sugerida
  const faixa: Faixa | null = fechamento?.faixa ?? (ctx.admin ? ctx.faixaSugerida : null);

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">{ctx.admin ? vendedor.nome : "Suas vendas"} no mês</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card rotulo="Vendas" valor={String(r.qtd)} detalhe={r.semTicket > 0 ? `+${r.semTicket} sem ticket (sem comissão)` : undefined} />
          <Card rotulo="Bruto" valor={reais(r.bruto)} />
          <Card rotulo="Líquido" valor={reais(r.liquido)} />
          <Card
            rotulo={fechamento ? `Comissão (${fechamento.faixa}%)` : faixa ? `Comissão (prévia ${faixa}%)` : "Comissão"}
            valor={faixa ? reais(r.comissao[faixa]) : "a definir"}
            detalhe={fechamento ? undefined : "O % sai quando o admin fechar o mês."}
          />
        </div>

        <div className="rolagem-fina overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px] tabular-nums">
            <thead className="text-[11px] uppercase tracking-wide text-ink-faint">
              <tr>
                {FAIXAS.map((f) => (
                  <th key={f} className={cn("py-2 pr-3 font-medium", faixa === f && "text-white")}>{f}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line-soft">
                {FAIXAS.map((f) => (
                  <td key={f} className={cn("py-2 pr-3", faixa === f ? "font-semibold text-white" : "text-ink-dim")}>{reais(r.comissao[f])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <CopiarResumo texto={textoPrestacao(r, fechamento?.faixa ?? null)} />
          {r.reembolsos + r.chargebacks > 0 && (
            <span className="text-[12px] text-ink-faint">Reembolsos: {r.reembolsos} · Chargebacks: {r.chargebacks} (fora dos totais)</span>
          )}
        </div>
      </section>

      {ctx.admin && <FechamentoDoMes vendedor={vendedor} fechamento={fechamento} r={r} ctx={ctx} />}

      <ListaVendas vendas={vendas} ctx={ctx} mostrarVendedor={false} />
    </>
  );
}

/** Admin: escolher o % do vendedor no mês, fechar e exportar (CSV e PDF) pro Rodrigo. */
function FechamentoDoMes({
  vendedor,
  fechamento,
  r,
  ctx,
}: {
  vendedor: Vendedor;
  fechamento: Fechamento | null;
  r: ReturnType<typeof resumir>;
  ctx: Contexto;
}) {
  // fechado e depois mudou alguma venda (reembolso, correção): avisa para atualizar
  const mudou =
    fechamento &&
    (fechamento.qtd !== r.qtd ||
      fechamento.bruto !== r.bruto ||
      fechamento.comissao !== r.comissao[fechamento.faixa] ||
      fechamento.reembolsos !== r.reembolsos ||
      fechamento.chargebacks !== r.chargebacks);
  const params = `mes=${ctx.mes}&vendedor=${vendedor.equipe_id}`;

  return (
    <section className="glass-lite glass-static flex flex-col gap-3 p-5">
      <h2 className="text-[17px]">Fechamento de {nomeDoMes(ctx.mes)}</h2>
      {fechamento ? (
        <p className="text-[13px] text-ink-dim">
          Fechado em <b className="text-white">{fechamento.faixa}%</b> no dia {dataCurta(fechamento.fechado_em)}: {fechamento.qtd} vendas,
          comissão <b className="text-white">{reais(fechamento.comissao)}</b>.
          {fechamento.faixa_sugerida && fechamento.faixa_sugerida !== fechamento.faixa && <> (A margem sugeria {fechamento.faixa_sugerida}%.)</>}
        </p>
      ) : (
        <p className="text-[13px] text-ink-dim">Mês aberto. Escolha o % de {vendedor.nome} e feche para congelar os totais e liberar a exportação.</p>
      )}
      {mudou && (
        <p className="text-[13px] text-[rgb(var(--tag-laranja))]">
          As vendas mudaram depois do fechamento (agora: {r.qtd} vendas, comissão {reais(r.comissao[fechamento.faixa])}). Atualize o fechamento.
        </p>
      )}
      <FecharMes mes={ctx.mes} vendedorId={vendedor.equipe_id} faixaAtual={fechamento?.faixa ?? null} faixaSugerida={ctx.faixaSugerida} />
      {fechamento && (
        <div className="flex flex-wrap gap-3 text-[13px]">
          <a href={`/api/vendas/fechamento?${params}`} className="underline underline-offset-4">Exportar CSV</a>
          <Link href={`/vendas/fechamento?${params}`} className="underline underline-offset-4">Versão para PDF</Link>
        </div>
      )}
    </section>
  );
}

/** Histórico mês a mês do vendedor: o que foi fechado e o que ainda está aberto. */
function Historico({ historico, mesAtual, aba }: { historico: MesHistorico[]; mesAtual: string; aba: string }) {
  if (historico.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Histórico</h2>
      <div className="rolagem-fina overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[13px] tabular-nums">
          <thead className="text-[11px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="py-2 pr-3 font-medium">Mês</th>
              <th className="py-2 pr-3 font-medium">Vendas</th>
              <th className="py-2 pr-3 font-medium">Bruto</th>
              <th className="py-2 pr-3 font-medium">Líquido</th>
              <th className="py-2 pr-3 font-medium">%</th>
              <th className="py-2 pr-3 font-medium">Comissão</th>
            </tr>
          </thead>
          <tbody>
            {historico.map(({ mes, resumo: r, fechamento }) => (
              <tr key={mes} className={cn("border-t border-line-soft", mes === mesAtual && "text-white")}>
                <td className="py-2 pr-3 capitalize">
                  <Link href={`/vendas?mes=${mes}${aba ? `&aba=${aba}` : ""}`} className="underline-offset-4 hover:underline">{nomeDoMes(mes)}</Link>
                </td>
                <td className="py-2 pr-3">{r.qtd}{r.semTicket > 0 && <span className="text-ink-faint"> +{r.semTicket}</span>}</td>
                <td className="py-2 pr-3">{reais(r.bruto)}</td>
                <td className="py-2 pr-3">{reais(r.liquido)}</td>
                <td className="py-2 pr-3">{fechamento ? `${fechamento.faixa}%` : <span className="text-ink-faint">aberto</span>}</td>
                <td className="py-2 pr-3">{fechamento ? reais(fechamento.comissao) : <span className="text-ink-faint">a definir</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const COR_STATUS = { pago: "verde", reembolso: "laranja", chargeback: "vermelho" } as const;

function ListaVendas({ vendas, ctx, mostrarVendedor }: { vendas: Venda[]; ctx: Contexto; mostrarVendedor: boolean }) {
  const nomeVendedor = (id: number | null, semVendedor: boolean) =>
    semVendedor ? "não é de vendedor" : (ctx.vendedores.find((v) => v.equipe_id === id)?.nome ?? "a revisar");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Vendas do mês · {vendas.length}</h2>
      {vendas.length === 0 ? (
        <p className="text-[13.5px] text-ink-faint">Nenhuma venda neste mês.</p>
      ) : (
        <ul className="flex flex-col">
          {vendas.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft py-2 last:border-b-0">
              <span className="text-[12.5px] tabular-nums text-ink-faint">{quando(v.pago_em)}</span>
              <span className="w-20 text-[14px] font-semibold text-white">{rotuloTicket(ctx, v.ticket_id)}</span>
              <span className="text-[13px] text-ink-dim">
                {ctx.admin && ctx.clientes.get(v.id) ? `${ctx.clientes.get(v.id)} · ` : ""}lead final {v.final_lead ?? "?"}
              </span>
              <Etiqueta cor={COR_STATUS[v.status]}>{v.status}</Etiqueta>
              {v.bumps.length > 0 && <Etiqueta cor="cinza">+{v.bumps.length} bump</Etiqueta>}
              {v.origem === "importacao" && <Etiqueta cor="cinza">histórico</Etiqueta>}
              {ctx.admin && precisaRevisar(v) && <Etiqueta cor="laranja">a revisar</Etiqueta>}
              {!v.ticket_id && v.motivo_sem_ticket && <span className="text-[12px] text-[rgb(var(--tag-laranja))]">{v.motivo_sem_ticket}</span>}
              {mostrarVendedor && <span className="text-[12.5px] text-ink-dim">{nomeVendedor(v.vendedor_id, v.sem_vendedor)}</span>}
              {ctx.admin && (
                <>
                  <div className="ml-auto">
                    <AtribuirVenda
                      vendaId={v.id}
                      atual={v.sem_vendedor ? "ninguem" : v.vendedor_id ? String(v.vendedor_id) : "a_atribuir"}
                      vendedores={ctx.vendedores}
                    />
                  </div>
                  <CorrigirVenda vendaId={v.id} ticketId={v.ticket_id} status={v.status} tickets={ticketsParaSelect(ctx)} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
