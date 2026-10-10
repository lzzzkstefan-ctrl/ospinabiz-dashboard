import { usuarioLogado, type PapelVendas } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { listarVendedores, margemDoMes } from "@/modulos/vendas/dados";
import { resumirLI, resumoAnual } from "@/modulos/vendas/lock-in";
import { diaSP, FAIXAS, lerMes, mesDe, nomeDoMes, somarMes, type Faixa } from "@/modulos/vendas/regras";
import {
  carregarVendas,
  faixasSugeridas,
  geralCompleta,
  geralEquipe,
  listarAdiantamentos,
  listarAjustes,
  listarAlteracoes,
  listarEstornos,
  listarFechamentosLI,
  listarPlataformas,
  listarTicketsLI,
  mesDoVendedor,
  whatsappFechamento,
  type LinhaGeral,
} from "@/modulos/vendas/tela";
import Link from "next/link";
import { Suspense } from "react";
import { formatBRLServidor } from "./_lockin/formato";
import { PainelVendas, type VerLista } from "./_lockin/painel";
import { ResumoAnual } from "./_lockin/resumo-anual";

type Busca = { v?: string; visao?: string; mes?: string; ver?: string; ano?: string };
type Props = { searchParams: Promise<Busca> };

// Vendas no formato do Lock in (masterview). O que cada um vê depende do papel em VENDAS
// (lib/auth/papeis.ts), e o banco (RLS) garante o mesmo:
//   chefe    → abas de todos os vendedores + Geral completa + Configuração;
//   gerente  → a própria aba + Geral completa (só números agregados, sem vendas do outro);
//   vendedor → a própria aba + Geral da equipe (quantidade, % da meta e o ticket médio dele).
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
  // plantonista não tem Vendas (o proxy já tira da tela; o banco não deixa ler)
  if (!usuario || usuario.vendas === "nenhum") return null;
  const sp = await searchParams;
  const papel = usuario.vendas;
  const chefe = papel === "chefe";
  const hoje = diaSP(new Date())!;
  const mesAtual = mesDe(hoje);
  const mes = lerMes(um(sp.mes), mesAtual);
  const ver: VerLista = sp.ver === "reembolso" || sp.ver === "tabela" ? sp.ver : "pago";

  const vendedores = (await listarVendedores()).filter((v) => v.ativo);
  const eu = vendedores.find((v) => v.usuario_id === usuario.id) ?? null;
  if (!chefe && !eu) return <p className="text-[13.5px] text-ink-dim">Seu login ainda não está ligado a um vendedor. Fale com o chefe de Vendas.</p>;

  // quem está na tela: o chefe escolhe qualquer vendedor; os outros só a própria aba ou "Geral"
  const escolhido = sp.v === "geral" ? null : chefe ? (vendedores.find((v) => String(v.equipe_id) === sp.v) ?? eu ?? vendedores[0] ?? null) : eu;
  const geral = escolhido === null;
  const visao = !geral && sp.visao === "ano" ? "ano" : "mes";
  const base = `/vendas?v=${geral ? "geral" : escolhido!.equipe_id}`;
  // abas: o vendedor não recebe nem o nome dos outros
  const abas = (chefe ? vendedores : [eu!]).map((v) => ({ id: v.equipe_id, nome: v.nome }));
  // nomes para a Geral completa (chefe e gerente veem os totais de cada vendedor, sem as vendas)
  const nomes = new Map(vendedores.map((v) => [v.equipe_id, v.nome]));

  return (
    <>
      <nav className="flex flex-wrap gap-1.5" aria-label="Vendedor">
        {[...abas.map((o) => ({ id: String(o.id), nome: o.nome })), { id: "geral", nome: "Geral" }].map((o) => {
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
        {chefe && (
          <Link href={`/vendas/config?mes=${mes}`} className="ml-auto self-center text-[12.5px] text-ink-dim underline-offset-4 hover:underline">
            Configuração
          </Link>
        )}
      </nav>

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
      ) : geral && !chefe ? (
        <GeralSemVendas papel={papel} eu={{ id: eu!.equipe_id, nome: eu!.nome }} nomes={nomes} mes={mes} />
      ) : (
        <Mes
          papel={papel}
          vendedor={geral ? null : { id: escolhido!.equipe_id, nome: escolhido!.nome }}
          proprio={!geral && escolhido!.equipe_id === eu?.equipe_id}
          opcoes={abas}
          nomes={nomes}
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
  papel,
  vendedor,
  proprio,
  opcoes,
  nomes,
  mes,
  mesAtual,
  ver,
  hoje,
  base,
}: {
  papel: PapelVendas;
  vendedor: { id: number; nome: string } | null;
  /** a aba é do próprio usuário logado */
  proprio: boolean;
  opcoes: { id: number; nome: string }[];
  nomes: Map<number, string>;
  mes: string;
  mesAtual: string;
  ver: VerLista;
  hoje: string;
  base: string;
}) {
  const chefe = papel === "chefe";
  const ano = Number(mes.slice(0, 4));
  const fim = `${somarMes(mes, 1)}-01`;
  const [tickets, vendas, margem, mesVend, adiantamentos, fechamentos, whatsapp, plataformas, estornos, ajustes, linhasGeral, equipe] = await Promise.all([
    listarTicketsLI(),
    carregarVendas(vendedor?.id ?? null, `${mes}-01`, fim),
    // só a faixa sugerida sai daqui (a margem e os custos ficam no servidor)
    margemDoMes(mes).then((m) => m.faixa),
    vendedor ? mesDoVendedor(mes, vendedor.id) : null,
    vendedor ? listarAdiantamentos(vendedor.id, ano) : [],
    vendedor ? listarFechamentosLI(vendedor.id, ano) : [],
    chefe && vendedor ? whatsappFechamento() : null,
    listarPlataformas(),
    vendedor ? listarEstornos(vendedor.id) : [],
    vendedor ? listarAjustes(vendedor.id, ano) : [],
    vendedor ? null : geralCompleta(mes),
    vendedor ? null : geralEquipe(mes),
  ]);
  const fechado = fechamentos.find((f) => f.mes === mes) ?? null;
  // registro de alterações: só o chefe, só de mês fechado
  const alteracoes = chefe && vendedor && fechado ? await listarAlteracoes(mes, vendedor.id) : [];
  const margemPadrao: Faixa = fechado?.faixa ?? margem ?? 10;

  return (
    <>
      {linhasGeral && equipe && (
        <>
          <Meta mes={mes} pagas={equipe.pagas} meta={equipe.meta} />
          <ResumoPorVendedor linhas={linhasGeral} nomes={nomes} faixa={margem} />
        </>
      )}
      <PainelVendas
        admin={chefe}
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
        // vendedor e gerente cadastram só na própria aba, no próprio nome (o servidor confere)
        podeCriar={chefe || proprio}
        vendedorFixo={!chefe}
        confirmaProprias={papel === "gerente" && proprio}
        fechamento={
          vendedor && mesVend
            ? {
                observacoesSalvas: mesVend.observacoes,
                codigo: chefe ? mesVend.codigo : null,
                whatsapp,
                adiantamentos: adiantamentos.filter((a) => a.mes === mes).map(({ id, valor, data }) => ({ id, valor, data })),
                estornos,
                ajustes: ajustes.filter((a) => a.mes === mes),
                alteracoes,
                fechado: fechado
                  ? { faixa: fechado.faixa, quando: fechado.fechado_em, qtd: fechado.qtd, semTicket: fechado.semTicket, comissao: fechado.comissao, estornos: fechado.estornos }
                  : null,
              }
            : undefined
        }
      />
    </>
  );
}

/** "Geral" de quem não é chefe: nunca carrega vendas de ninguém além das próprias. */
async function GeralSemVendas({ papel, eu, nomes, mes }: { papel: PapelVendas; eu: { id: number; nome: string }; nomes: Map<number, string>; mes: string }) {
  const fim = `${somarMes(mes, 1)}-01`;
  const completa = papel === "gerente";
  const [equipe, linhas, margem, minhas, tickets] = await Promise.all([
    geralEquipe(mes),
    completa ? geralCompleta(mes) : null,
    completa ? margemDoMes(mes).then((m) => m.faixa) : null,
    carregarVendas(eu.id, `${mes}-01`, fim),
    listarTicketsLI(),
  ]);
  // ticket médio DELE (bruto de ticket ÷ vendas pagas com ticket). O da equipe não aparece:
  // com a quantidade da equipe, revelaria o faturamento do outro.
  const r = resumirLI(minhas, tickets);
  const comTicket = r.qtd - r.semTicket - r.semTicketProduto;
  return (
    <>
      <MesNav mes={mes} />
      <Meta mes={mes} pagas={equipe.pagas} meta={equipe.meta} ticketMedio={comTicket ? Math.round(r.bruto / comTicket) : null} />
      {linhas && <ResumoPorVendedor linhas={linhas} nomes={nomes} faixa={margem} />}
      {!completa && (
        <p className="m-0 text-[12px] text-ink-faint">
          A Geral mostra só números da equipe, sem valores em reais. As suas vendas e a sua comissão ficam na aba {eu.nome}.
        </p>
      )}
    </>
  );
}

function MesNav({ mes }: { mes: string }) {
  return (
    <div className="flex items-center gap-3 text-[13.5px]">
      <Link href={`/vendas?v=geral&mes=${somarMes(mes, -1)}`} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">
        ←
      </Link>
      <span className="font-semibold capitalize text-white">{nomeDoMes(mes)}</span>
      <Link href={`/vendas?v=geral&mes=${somarMes(mes, 1)}`} className="rounded-full px-3 py-1.5 text-ink-dim hover:bg-bg-raised-2 hover:text-white">
        →
      </Link>
    </div>
  );
}

/** Quantidade de vendas da equipe x meta do mês (e o ticket médio próprio, para o vendedor). */
function Meta({ mes, pagas, meta, ticketMedio }: { mes: string; pagas: number; meta: number | null; ticketMedio?: number | null }) {
  const cartao = "glass-lite glass-static flex flex-col gap-1 p-4";
  return (
    <section className={cn("grid gap-3", ticketMedio === undefined ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
      <div className={cartao}>
        <span className="text-[24px] font-semibold tabular-nums text-white">{pagas}</span>
        <span className="text-xs text-ink-dim">vendas da equipe em {nomeDoMes(mes)}</span>
      </div>
      <div className={cartao}>
        <span className="text-[24px] font-semibold tabular-nums text-white">{meta ?? "—"}</span>
        <span className="text-xs text-ink-dim">{meta ? "meta do mês (vendas)" : "meta do mês: ainda não definida"}</span>
      </div>
      <div className={cartao}>
        <span className="text-[24px] font-semibold tabular-nums text-white">{meta ? `${Math.round((pagas / meta) * 100)}%` : "—"}</span>
        <span className="text-xs text-ink-dim">da meta</span>
      </div>
      {ticketMedio !== undefined && (
        <div className={cartao}>
          <span className="text-[24px] font-semibold tabular-nums text-white">{ticketMedio === null ? "—" : formatBRLServidor(ticketMedio)}</span>
          <span className="text-xs text-ink-dim">seu ticket médio (bruto de ticket)</span>
        </div>
      )}
    </section>
  );
}

/** Geral completa (chefe e gerente): os vendedores lado a lado, SÓ com números agregados do banco. */
function ResumoPorVendedor({ linhas: brutas, nomes, faixa }: { linhas: LinhaGeral[]; nomes: Map<number, string>; faixa: Faixa | null }) {
  const linhas = brutas
    .map((l) => ({ ...l, nome: l.vendedorId === null ? "Sem vendedor" : (nomes.get(l.vendedorId) ?? "Vendedor inativo") }))
    .filter((l) => l.vendedorId !== null || l.pagas + l.reembolsos + l.chargebacks > 0)
    .sort((a, b) => (a.vendedorId === null ? 1 : b.vendedorId === null ? -1 : a.nome.localeCompare(b.nome, "pt-BR")));
  const semValor = linhas.reduce((s, l) => s + l.semReceita, 0);
  return (
    <section className="glass-lite glass-static overflow-x-auto p-4">
      <h3 className="mb-3 text-[15px] font-semibold text-white">Por vendedor</h3>
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <thead className="text-[11.5px] text-ink-dim">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Vendedor</th>
            <th className="py-1.5 pr-3 text-right font-medium">Vendas</th>
            <th className="py-1.5 pr-3 text-right font-medium">Receita na Hubla (com bumps)</th>
            <th className="py-1.5 pr-3 text-right font-medium">Bruto de ticket</th>
            <th className="py-1.5 pr-3 text-right font-medium">Líquido de ticket</th>
            {FAIXAS.map((f) => (
              <th key={f} className={cn("py-1.5 pr-3 text-right font-medium", faixa === f && "text-white")}>
                {f}%
              </th>
            ))}
            <th className="py-1.5 text-right font-medium">Reemb.</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome} className="border-t border-line-soft text-ink">
              <td className="py-1.5 pr-3 text-white">{l.nome}</td>
              <td className="py-1.5 pr-3 text-right">{l.pagas}</td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right text-white" title={l.semReceita ? `${l.semReceita} venda(s) paga(s) ainda sem o valor da Hubla` : undefined}>
                {formatBRLServidor(l.receita)}
                {l.semReceita > 0 && <span className="ml-1 text-[11px] text-accent-3">({l.semReceita} sem valor)</span>}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right">{formatBRLServidor(l.bruto)}</td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-right">{formatBRLServidor(l.liquido)}</td>
              {FAIXAS.map((f) => (
                <td key={f} className={cn("whitespace-nowrap py-1.5 pr-3 text-right", faixa === f ? "text-white" : "text-ink-dim")}>
                  {formatBRLServidor(l.comissao[f])}
                </td>
              ))}
              <td className="py-1.5 text-right">{l.reembolsos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 mt-2 text-[11.5px] text-ink-faint">
        {faixa ? `Faixa sugerida pela margem do mês: ${faixa}%.` : "Margem do mês ainda sem sugestão (falta valor em Configuração)."} O % de cada um é escolhido
        no fechamento, na tela dele. Receita na Hubla = valor real das faturas pagas, com order bumps e já sem a taxa da Hubla (vendas de teste e
        pendentes ficam fora){semValor > 0 ? ` (${semValor} venda(s) do mês ainda sem esse valor)` : ""}; bruto e líquido de ticket = base da comissão (sem bumps).
      </p>
    </section>
  );
}

async function Anual({ vendedorId, ano, anoAtual, base }: { vendedorId: number; ano: number; anoAtual: number; base: string }) {
  const [tickets, vendas, fechamentos, sugeridas, adiantamentos, estornos, ajustes] = await Promise.all([
    listarTicketsLI(),
    carregarVendas(vendedorId, `${ano}-01-01`, `${ano + 1}-01-01`),
    listarFechamentosLI(vendedorId, ano),
    faixasSugeridas(ano),
    listarAdiantamentos(vendedorId, ano),
    listarEstornos(vendedorId),
    listarAjustes(vendedorId, ano),
  ]);
  const meses = resumoAnual(ano, vendas, tickets, fechamentos, sugeridas, adiantamentos, estornos, ajustes);
  const anos = Array.from({ length: anoAtual - 2026 + 1 }, (_, i) => 2026 + i);
  return <ResumoAnual ano={ano} anos={anos} meses={meses} base={base} />;
}
