import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import {
  carregarPainel,
  listarTickets,
  listarVendedores,
  margemDoMes,
  nomesDosClientes,
  type Vendedor,
} from "@/modulos/vendas/dados";
import {
  FAIXAS,
  centavos,
  diaSP,
  lerMes,
  mesDe,
  nomeDoMes,
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
import { AtribuirVenda, BotaoEMinha, CopiarResumo, CorrigirVenda } from "./_componentes/formularios";

type Props = { searchParams: Promise<{ mes?: string | string[]; aba?: string | string[] }> };

// Vendas: admin vê a operação inteira e cada vendedor; o vendedor vê só o que é dele
// (o RLS do banco garante). Regras em modulos/vendas/regras.ts.
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

type Contexto = {
  admin: boolean;
  tickets: Ticket[];
  vendedores: Vendedor[];
  clientes: Map<number, string>;
  faixa: Faixa | null;
};

async function ConteudoVendas({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario) return null;
  const sp = await searchParams;

  const hoje = diaSP(new Date())!;
  const mesAtual = mesDe(hoje);
  const mes = lerMes(sp.mes, mesAtual);
  const admin = usuario.papel === "admin";

  const [vendedores, tickets, painel, margem] = await Promise.all([
    listarVendedores(),
    listarTickets(),
    carregarPainel(mes, hoje),
    margemDoMes(mes),
  ]);
  const eu = vendedores.find((v) => v.usuario_id === usuario.id && v.ativo) ?? null;

  if (!admin && !eu) {
    return <p className="text-[13.5px] text-ink-dim">Seu login ainda não está ligado a um vendedor. Fale com o admin.</p>;
  }

  const clientes = admin
    ? await nomesDosClientes([...painel.vendasMes, ...painel.aAtribuir].map((v) => v.id))
    : new Map<number, string>();
  const ctx: Contexto = { admin, tickets, vendedores, clientes, faixa: margem.faixa };
  const abaBruta = typeof sp.aba === "string" ? sp.aba : "";
  const vendedorDaAba = admin ? vendedores.find((v) => String(v.equipe_id) === abaBruta) ?? null : eu;

  return (
    <>
      <SeletorMes mes={mes} mesAtual={mesAtual} aba={abaBruta} />

      {mes === mesAtual && (
        <Hoje
          vendas={painel.vendasHoje}
          reembolsos={painel.reembolsosHoje}
          aAtribuir={painel.aAtribuir.length}
          ctx={ctx}
        />
      )}

      {admin && (
        <p className="text-[13px] text-ink-dim">
          {margem.completa && margem.margemPct !== null
            ? <>Margem de {nomeDoMes(mes)}: <b className="text-white">{margem.margemPct.toFixed(1).replace(".", ",")}%</b> → comissão na faixa de <b className="text-white">{margem.faixa}%</b>.</>
            : <>Comissão de {nomeDoMes(mes)} em <b className="text-white">prévia</b>: falta informar gasto em anúncios, imposto Meta ou custo de mensagens.</>}{" "}
          <Link href={`/vendas/config?mes=${mes}`} className="underline underline-offset-4">Configuração</Link>
        </p>
      )}

      <CaixaAAtribuir vendas={painel.aAtribuir} podeReivindicar={Boolean(eu)} ctx={ctx} />

      {admin && <Abas mes={mes} atual={vendedorDaAba?.equipe_id ?? null} vendedores={vendedores} />}

      {vendedorDaAba ? (
        <PainelVendedor
          vendedor={vendedorDaAba}
          vendas={painel.vendasMes.filter((v) => v.vendedor_id === vendedorDaAba.equipe_id)}
          ctx={ctx}
        />
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
function Hoje({ vendas, reembolsos, aAtribuir, ctx }: { vendas: Venda[]; reembolsos: Venda[]; aAtribuir: number; ctx: Contexto }) {
  // vendedor: o RLS devolve as dele e as "A atribuir"; aqui contam só as dele
  const minhas = (v: Venda) => ctx.admin || v.vendedor_id !== null;
  const resumo = resumir(vendas.filter(minhas), ctx.tickets);
  const reembolsosHoje = reembolsos.filter(minhas).length;
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
        <Card rotulo="Reembolsos hoje" valor={String(reembolsosHoje)} alerta={reembolsosHoje > 0} />
        <Card rotulo="Pendentes (a atribuir)" valor={String(aAtribuir)} alerta={aAtribuir > 0} />
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

function CaixaAAtribuir({ vendas, podeReivindicar, ctx }: { vendas: Venda[]; podeReivindicar: boolean; ctx: Contexto }) {
  if (vendas.length === 0) return null;
  return (
    <section className="glass glass-destaque flex flex-col gap-3 p-5">
      <h2 className="text-[17px]">A atribuir · {vendas.length}</h2>
      <p className="text-[12.5px] text-ink-dim">Vendas aprovadas sem código de vendedor no link (ou com código desconhecido).</p>
      <ul className="flex flex-col">
        {vendas.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft py-2 last:border-b-0">
            <span className="text-[13px] tabular-nums text-ink-dim">{quando(v.pago_em)}</span>
            <span className="text-[14px] font-semibold text-white">{rotuloTicket(ctx, v.ticket_id)}</span>
            <span className="text-[13px] text-ink-dim">
              {ctx.admin && ctx.clientes.get(v.id) ? `${ctx.clientes.get(v.id)} ` : ""}lead final {v.final_lead ?? "?"}
            </span>
            {v.utm_term && <Etiqueta cor="cinza">utm: {v.utm_term}</Etiqueta>}
            {v.status !== "pago" && <Etiqueta cor="laranja">{v.status}</Etiqueta>}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {podeReivindicar && <BotaoEMinha vendaId={v.id} />}
              {ctx.admin && <AtribuirVenda vendaId={v.id} atual="a_atribuir" vendedores={ctx.vendedores} />}
            </div>
          </li>
        ))}
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

/** Admin: resumo do mês da operação e de cada vendedor + todas as vendas. */
function Geral({ vendas, ctx }: { vendas: Venda[]; ctx: Contexto }) {
  const geral = resumir(vendas, ctx.tickets);
  const linhas = [
    ...ctx.vendedores.map((v) => ({ nome: v.nome, r: resumir(vendas.filter((x) => x.vendedor_id === v.equipe_id), ctx.tickets) })),
    { nome: "Sem vendedor / a atribuir", r: resumir(vendas.filter((x) => x.vendedor_id === null), ctx.tickets) },
  ];

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Resumo do mês</h2>
        <div className="rolagem-fina overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="py-2 pr-3 font-medium">Vendedor</th>
                <th className="py-2 pr-3 font-medium">Vendas</th>
                <th className="py-2 pr-3 font-medium">Bruto</th>
                <th className="py-2 pr-3 font-medium">Líquido</th>
                <th className="py-2 pr-3 font-medium">Comissão {ctx.faixa ? `(${ctx.faixa}%)` : "(prévia 6%–10%)"}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {linhas.map(({ nome, r }) => (
                <tr key={nome} className="border-t border-line-soft">
                  <td className="py-2 pr-3 text-white">{nome}</td>
                  <td className="py-2 pr-3">{r.qtd}{r.semTicket > 0 && <span className="text-ink-faint"> +{r.semTicket} sem ticket</span>}</td>
                  <td className="py-2 pr-3">{reais(r.bruto)}</td>
                  <td className="py-2 pr-3">{reais(r.liquido)}</td>
                  <td className="py-2 pr-3">{ctx.faixa ? reais(r.comissao[ctx.faixa]) : `${reais(r.comissao[6])} – ${reais(r.comissao[10])}`}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold text-white">
                <td className="py-2 pr-3">Operação</td>
                <td className="py-2 pr-3">{geral.qtd + geral.semTicket}</td>
                <td className="py-2 pr-3">{reais(geral.bruto)}</td>
                <td className="py-2 pr-3">{reais(geral.liquido)}</td>
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

/** Aba do vendedor: totais, comissão na faixa (ou prévia), comparativo 6%–10% e "Copiar resumo". */
function PainelVendedor({ vendedor, vendas, ctx }: { vendedor: Vendedor; vendas: Venda[]; ctx: Contexto }) {
  const r = resumir(vendas, ctx.tickets);
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">{ctx.admin ? vendedor.nome : "Suas vendas"} no mês</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card rotulo="Vendas" valor={String(r.qtd)} detalhe={r.semTicket > 0 ? `+${r.semTicket} sem ticket identificado` : undefined} />
          <Card rotulo="Bruto" valor={reais(r.bruto)} />
          <Card rotulo="Líquido" valor={reais(r.liquido)} />
          <Card
            rotulo={ctx.faixa ? `Comissão (faixa ${ctx.faixa}%)` : "Comissão (prévia)"}
            valor={ctx.faixa ? reais(r.comissao[ctx.faixa]) : "a definir"}
            detalhe={ctx.faixa ? undefined : "A faixa sai quando o admin fechar a margem do mês."}
          />
        </div>

        <div className="rolagem-fina overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px] tabular-nums">
            <thead className="text-[11px] uppercase tracking-wide text-ink-faint">
              <tr>
                {FAIXAS.map((f) => (
                  <th key={f} className={cn("py-2 pr-3 font-medium", ctx.faixa === f && "text-white")}>{f}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line-soft">
                {FAIXAS.map((f) => (
                  <td key={f} className={cn("py-2 pr-3", ctx.faixa === f ? "font-semibold text-white" : "text-ink-dim")}>{reais(r.comissao[f])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <CopiarResumo texto={textoPrestacao(r, ctx.faixa)} />
          {r.reembolsos + r.chargebacks > 0 && (
            <span className="text-[12px] text-ink-faint">Reembolsos: {r.reembolsos} · Chargebacks: {r.chargebacks} (fora dos totais)</span>
          )}
        </div>
      </section>
      <ListaVendas vendas={vendas} ctx={ctx} mostrarVendedor={false} />
    </>
  );
}

const COR_STATUS = { pago: "verde", reembolso: "laranja", chargeback: "vermelho" } as const;

function ListaVendas({ vendas, ctx, mostrarVendedor }: { vendas: Venda[]; ctx: Contexto; mostrarVendedor: boolean }) {
  const ticketsParaSelect = ctx.tickets.map((t) => ({ id: t.id, rotulo: `${precoCurto(centavos(t.valor_bruto))}${t.ativo ? "" : " (inativo)"}` }));
  const nomeVendedor = (id: number | null, semVendedor: boolean) =>
    semVendedor ? "não é de vendedor" : (ctx.vendedores.find((v) => v.equipe_id === id)?.nome ?? "a atribuir");

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
                  <CorrigirVenda vendaId={v.id} ticketId={v.ticket_id} status={v.status} tickets={ticketsParaSelect} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
