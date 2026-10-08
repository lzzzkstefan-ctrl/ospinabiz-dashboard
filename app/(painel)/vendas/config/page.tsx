import { Gaveta } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Etiqueta } from "@/components/ui/etiqueta";
import { Input } from "@/components/ui/input";
import { usuarioLogado } from "@/lib/auth/papeis";
import { listarCustos, listarEventosComErro, listarTickets, margemDoMes, type MargemDoMes } from "@/modulos/vendas/dados";
import { custosParaLeitura, listarPlataformas } from "@/modulos/vendas/tela";
import { Plataformas } from "./plataformas";
import { centavos, custosDoMes, diaSP, lerMes, mesDe, nomeDoMes, precoCurto, reais, somarMes } from "@/modulos/vendas/regras";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { alternarCusto, alternarTicket, reprocessar, reprocessarTodos } from "../acoes";
import { FormMes, FormNovoCusto, FormTicket, FormValorCusto } from "../_componentes/formularios";

type Props = { searchParams: Promise<{ mes?: string | string[] }> };

// Configuração de Vendas. Admin: edita valores do mês, custos fixos, tickets e vê eventos
// da Hubla com erro. Atendente: SÓ LEITURA do mês, dos custos fixos e da conta da margem
// (campos desabilitados, sem salvar). Gravar continua só do admin: as ações conferem o
// papel e o RLS do banco não deixa atendente inserir nem editar essas tabelas.
// O único número da operação que aparece é o líquido total usado na conta.
export default function ConfigVendasPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/vendas" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">← Vendas</Link>
        <h1 className="mt-1 text-[28px] leading-tight">Configuração de vendas</h1>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <ConteudoConfig searchParams={searchParams} />
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

async function ConteudoConfig({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario) notFound();
  if (usuario.papel !== "admin") return <ConfigLeitura searchParams={searchParams} />;
  const sp = await searchParams;
  const mesAtual = mesDe(diaSP(new Date())!);
  const mes = lerMes(sp.mes, mesAtual);

  const [margem, tickets, custos, eventos, plataformas] = await Promise.all([
    margemDoMes(mes),
    listarTickets(),
    listarCustos(),
    listarEventosComErro(),
    listarPlataformas(),
  ]);
  const doMes = custosDoMes(
    mes,
    custos,
    custos.flatMap((c) => c.valores.map((v) => ({ custo_id: c.id, vigente_desde: v.vigente_desde, valor: v.valor }))),
  );
  return (
    <>
      <div className="flex items-center gap-3 text-[13.5px]">
        <Link href={`/vendas/config?mes=${somarMes(mes, -1)}`} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">←</Link>
        <span className="font-semibold capitalize text-white">{nomeDoMes(mes)}</span>
        <Link href={`/vendas/config?mes=${somarMes(mes, 1)}`} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">→</Link>
      </div>

      <Secao titulo="Margem do mês">
        <FormMes mes={mes} gasto={margem.entradas.gastoAnuncios} imposto={margem.entradas.impostoMeta} mensagens={margem.entradas.custoMensagens} />
        <ContaDaMargem margem={margem} />
      </Secao>

      <Secao titulo="Custos fixos">
        <p className="text-[12.5px] text-ink-dim">O valor salvo vale a partir de {nomeDoMes(mes)}; os meses anteriores não mudam.</p>
        <ul className="flex flex-col">
          {custos.map((c) => {
            const atual = doMes.find((d) => d.id === c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 last:border-b-0">
                <span className="w-32 text-[14px] text-white">{c.nome}</span>
                {atual ? (
                  <FormValorCusto custoId={c.id} mes={mes} valor={atual.valor} />
                ) : (
                  <Etiqueta cor="cinza">{c.desativado_desde && `${mes}-01` >= c.desativado_desde ? `desativado desde ${c.desativado_desde.slice(0, 7)}` : "sem valor neste mês"}</Etiqueta>
                )}
                <form action={alternarCusto} className="ml-auto">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="mes" value={mes} />
                  <input type="hidden" name="acao" value={c.desativado_desde ? "reativar" : "desativar"} />
                  <Button type="submit" size="sm" variant="ghost">{c.desativado_desde ? "Reativar" : `Desativar a partir de ${mes}`}</Button>
                </form>
              </li>
            );
          })}
        </ul>
        <FormNovoCusto mes={mes} />
      </Secao>

      <Secao titulo="Plataformas">
        <Plataformas lista={plataformas} />
      </Secao>

      <Secao titulo="Tickets">
        <p className="text-[12.5px] text-ink-dim">Comissão em reais por venda, em cada faixa. Só tickets ativos são reconhecidos nas vendas novas.</p>
        <ul className="flex flex-col">
          {tickets.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft py-2 last:border-b-0">
              <span className="w-20 text-[14px] font-semibold text-white">{precoCurto(centavos(t.valor_bruto))}</span>
              <span className="text-[12.5px] tabular-nums text-ink-dim">
                líquido {reais(centavos(t.valor_liquido))} · 6% {reais(centavos(t.comissao_6))} · 10% {reais(centavos(t.comissao_10))}
              </span>
              {!t.ativo && <Etiqueta cor="cinza">inativo</Etiqueta>}
              <form action={alternarTicket} className="ml-auto">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="ativo" value={String(!t.ativo)} />
                <Button type="submit" size="sm" variant="ghost">{t.ativo ? "Desativar" : "Ativar"}</Button>
              </form>
              <Gaveta rotulo="Editar">
                <FormTicket ticket={t} />
              </Gaveta>
            </li>
          ))}
        </ul>
        <div className="glass-lite glass-static p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">Novo ticket</p>
          <FormTicket />
        </div>
      </Secao>

      <Secao titulo={`Eventos da Hubla com erro · ${eventos.length}`}>
        {eventos.length === 0 ? (
          <p className="text-[13.5px] text-ink-faint">Nenhum evento com erro.</p>
        ) : (
          <>
            <form action={reprocessarTodos}>
              <Button type="submit" size="sm">Reprocessar todos</Button>
            </form>
            <ul className="flex flex-col">
              {eventos.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 text-[13px] last:border-b-0">
                  <span className="tabular-nums text-ink-faint">#{e.id} · {new Date(e.recebido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                  <span className="text-white">{e.tipo ?? "?"}</span>
                  <span className="text-ink-dim">fatura {e.id_fatura ?? "?"}</span>
                  <span className="text-[rgb(var(--tag-laranja))]">{e.erro ?? "não terminou de processar"}</span>
                  <span className="text-ink-faint">{e.tentativas} tentativa(s)</span>
                  <form action={reprocessar} className="ml-auto">
                    <input type="hidden" name="id" value={e.id} />
                    <Button type="submit" size="sm" variant="secondary">Reprocessar</Button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </Secao>
    </>
  );
}

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

/** A conta da margem (igual para admin e atendente). Único número da operação: o líquido total. */
function ContaDaMargem({ margem }: { margem: MargemDoMes }) {
  return (
    <div className="glass-lite glass-static grid gap-1 p-4 text-[13.5px] tabular-nums">
      <p>Faturamento líquido (operação): <b className="text-white">{reais(margem.liquido)}</b></p>
      <p>− Gasto em anúncios: {margem.entradas.gastoAnuncios === null ? "não informado" : reais(margem.entradas.gastoAnuncios)}</p>
      <p>− Imposto Meta: {margem.entradas.impostoMeta === null ? "não informado" : reais(margem.entradas.impostoMeta)}</p>
      <p>− Custos fixos: {reais(margem.custosFixos)}{margem.custosSemValor.length > 0 && <span className="text-[rgb(var(--tag-laranja))]"> (sem valor: {margem.custosSemValor.join(", ")})</span>}</p>
      <p>− Custo de mensagens: {margem.entradas.custoMensagens === null ? "não informado" : reais(margem.entradas.custoMensagens)}</p>
      <p className="mt-1 border-t border-line-soft pt-2">
        {margem.completa && margem.lucro !== null && margem.margemPct !== null ? (
          <>Lucro {reais(margem.lucro)} · Margem <b className="text-white">{pct(margem.margemPct)}</b> → comissão sugerida <b className="text-white">{margem.faixa}%</b></>
        ) : (
          <>Comissão em <b className="text-white">prévia</b>: faltam valores do mês{margem.liquido <= 0 ? " (e ainda não há faturamento no mês)" : ""}.</>
        )}
      </p>
      <p className="text-[12px] text-ink-faint">Faixas: abaixo de 10% → 6% · 10% a 20% → 7% · 20% a 35% → 8% · 35% a 50% → 9% · acima de 50% → 10%. A comissão não entra na margem. O % que vale é o do fechamento, escolhido pelo admin.</p>
    </div>
  );
}

const valorCampo = (c: number | null) => (c === null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function CampoLeitura({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-ink-dim">
      {rotulo}
      <Input value={valorCampo(valor)} placeholder="não informado" disabled readOnly className="tabular-nums" />
    </label>
  );
}

/** Atendente: a mesma tela em modo leitura (sem tickets nem eventos da Hubla). */
async function ConfigLeitura({ searchParams }: Props) {
  const sp = await searchParams;
  const mesAtual = mesDe(diaSP(new Date())!);
  const mes = lerMes(sp.mes, mesAtual);
  const [margem, custos] = await Promise.all([margemDoMes(mes), custosParaLeitura()]);
  const doMes = custosDoMes(
    mes,
    custos,
    custos.flatMap((c) => c.valores.map((v) => ({ custo_id: c.id, vigente_desde: v.vigente_desde, valor: v.valor }))),
  );

  return (
    <>
      <p className="-mt-4 text-[12.5px] text-ink-faint">Só leitura: quem edita estes valores é o admin.</p>
      <div className="flex items-center gap-3 text-[13.5px]">
        <Link href={`/vendas/config?mes=${somarMes(mes, -1)}`} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">←</Link>
        <span className="font-semibold capitalize text-white">{nomeDoMes(mes)}</span>
        <Link href={`/vendas/config?mes=${somarMes(mes, 1)}`} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">→</Link>
      </div>

      <Secao titulo="Margem do mês">
        <div className="grid gap-3 sm:grid-cols-3">
          <CampoLeitura rotulo="Gasto em anúncios (R$)" valor={margem.entradas.gastoAnuncios} />
          <CampoLeitura rotulo="Imposto Meta (R$)" valor={margem.entradas.impostoMeta} />
          <CampoLeitura rotulo="Custo de mensagens (R$)" valor={margem.entradas.custoMensagens} />
        </div>
        <ContaDaMargem margem={margem} />
      </Secao>

      <Secao titulo="Custos fixos">
        <ul className="flex flex-col">
          {custos.map((c) => {
            const atual = doMes.find((d) => d.id === c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 last:border-b-0">
                <span className="w-32 text-[14px] text-white">{c.nome}</span>
                {atual ? (
                  <Input value={valorCampo(atual.valor)} placeholder="sem valor" disabled readOnly className="w-36 tabular-nums" aria-label={`Valor de ${c.nome}`} />
                ) : (
                  <Etiqueta cor="cinza">{c.desativado_desde && `${mes}-01` >= c.desativado_desde ? `desativado desde ${c.desativado_desde.slice(0, 7)}` : "sem valor neste mês"}</Etiqueta>
                )}
              </li>
            );
          })}
        </ul>
      </Secao>
    </>
  );
}
