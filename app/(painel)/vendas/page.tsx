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
  viralConversao,
  viralGeral,
  whatsappFechamento,
  type LinhaGeral,
  type LinhaViral,
} from "@/modulos/vendas/tela";
import { COR_VIRAL } from "@/modulos/vendas/cores";
import { contarPendentes } from "@/modulos/vendas/reembolsos";
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

  const [todosVendedores, reembolsosPendentes] = await Promise.all([listarVendedores(), contarPendentes()]);
  const vendedores = todosVendedores.filter((v) => v.ativo);
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
        <Link
          href="/vendas/reembolsos"
          className={cn(
            "ml-auto self-center text-[12.5px] underline-offset-4 hover:underline",
            reembolsosPendentes ? "font-semibold text-amber-300" : "text-ink-dim",
          )}
        >
          Reembolsos{reembolsosPendentes ? ` (${reembolsosPendentes} pendente${reembolsosPendentes > 1 ? "s" : ""})` : ""}
        </Link>
        {chefe && (
          <Link href={`/vendas/config?mes=${mes}`} className="self-center text-[12.5px] text-ink-dim underline-offset-4 hover:underline">
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
  const [tickets, vendas, margem, mesVend, adiantamentos, fechamentos, whatsapp, plataformas, estornos, ajustes, linhasGeral, equipe, viral, conversao] = await Promise.all([
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
    vendedor ? null : viralGeral(mes),
    vendedor ? null : viralConversao(mes),
  ]);
  const fechado = fechamentos.find((f) => f.mes === mes) ?? null;
  // registro de alterações: só o chefe, de qualquer mês (desde 10/10/2026 o mês aberto também é registrado)
  const alteracoes = chefe && vendedor ? await listarAlteracoes(mes, vendedor.id) : [];
  const margemPadrao: Faixa = fechado?.faixa ?? margem ?? 10;

  return (
    <>
      {linhasGeral && equipe && (
        <>
          <Meta mes={mes} pagas={equipe.pagas} meta={equipe.meta} />
          <ResumoPorVendedor linhas={linhasGeral} nomes={nomes} faixa={margem} />
          {viral && conversao && <GcsEViral gcs={linhasGeral} viral={viral} conversao={conversao} nomes={nomes} faixa={margem} />}
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
  const [equipe, linhas, margem, minhas, tickets, viral, conversao] = await Promise.all([
    geralEquipe(mes),
    completa ? geralCompleta(mes) : null,
    completa ? margemDoMes(mes).then((m) => m.faixa) : null,
    carregarVendas(eu.id, `${mes}-01`, fim),
    listarTicketsLI(),
    completa ? viralGeral(mes) : null,
    completa ? viralConversao(mes) : null,
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
      {linhas && viral && conversao && <GcsEViral gcs={linhas} viral={viral} conversao={conversao} nomes={nomes} faixa={margem} />}
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
            <th className="py-1.5 pr-3 text-right font-medium" title="Parte do ticket no valor que entrou de verdade (com juros do parcelamento). Só informação: a comissão usa o líquido de ticket da tabela.">
              Recebido real
            </th>
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
              <td className="whitespace-nowrap py-1.5 pr-3 text-right text-ink-dim">{l.recebidoReal ? formatBRLServidor(l.recebidoReal) : "—"}</td>
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
        pendentes ficam fora){semValor > 0 ? ` (${semValor} venda(s) do mês ainda sem esse valor)` : ""}; bruto e líquido de ticket = base da comissão (sem bumps), sempre pela
        tabela de tickets. Recebido real = parte do ticket no valor que entrou de verdade (com juros do parcelamento), só informação, desde outubro/2026.
      </p>
    </section>
  );
}

/** Ofertas do Viral na Hubla: R$ 48,90 a R$ 118,90, de 5 em 5 (centavos). */
const OFERTAS_VIRAL = Array.from({ length: 15 }, (_, i) => 4890 + i * 500);

/**
 * GCS x Protocolo Viral por vendedor (quantidade, faturamento, ticket médio e comissão), conversão do
 * downsell (etiqueta do Viral x compras) e vendas por oferta. Chefe e gerente; só números do banco.
 */
function GcsEViral({
  gcs,
  viral,
  conversao,
  nomes,
  faixa,
}: {
  gcs: LinhaGeral[];
  viral: LinhaViral[];
  conversao: { marcados: number; compraram: number; etiquetaDefinida: boolean };
  nomes: Map<number, string>;
  faixa: Faixa | null;
}) {
  const f: Faixa = faixa ?? 10;
  const nome = (id: number | null) => (id === null ? "Sem vendedor" : (nomes.get(id) ?? "Vendedor inativo"));
  const ids = [...new Set([...gcs.map((l) => l.vendedorId), ...viral.map((l) => l.vendedorId)])];
  const linhas = ids
    .map((id) => {
      const g = gcs.find((l) => l.vendedorId === id);
      const v = viral.filter((l) => l.vendedorId === id);
      const soma = (k: "pagas" | "faturamento" | "semLiquido") => v.reduce((s, l) => s + l[k], 0);
      return {
        id,
        nome: nome(id),
        gcs: { qtd: g?.pagas ?? 0, comTicket: g?.comTicket ?? 0, bruto: g?.bruto ?? 0, comissao: g?.comissao[f] ?? 0 },
        viral: { qtd: soma("pagas"), faturamento: soma("faturamento"), comissao: v.reduce((s, l) => s + l.comissao[f], 0), semLiquido: soma("semLiquido") },
      };
    })
    .filter((l) => l.gcs.qtd + l.viral.qtd > 0)
    .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : a.nome.localeCompare(b.nome, "pt-BR")));
  const totalViral = linhas.reduce((s, l) => s + l.viral.qtd, 0);
  const porPreco = new Map<number, number>();
  for (const l of viral) if (l.preco !== null && l.pagas) porPreco.set(l.preco, (porPreco.get(l.preco) ?? 0) + l.pagas);
  const precos = [...new Set([...OFERTAS_VIRAL, ...porPreco.keys()])].sort((a, b) => a - b);
  const max = Math.max(1, ...porPreco.values());
  const medio = (total: number, qtd: number) => (qtd ? formatBRLServidor(Math.round(total / qtd)) : "—");
  const th = "py-1.5 pr-3 text-right font-medium";
  const td = "whitespace-nowrap py-1.5 pr-3 text-right";

  return (
    <section className="glass-lite glass-static flex flex-col gap-5 p-4">
      <div>
        <h3 className="m-0 inline-flex items-center gap-2 text-[15px] font-semibold text-white">
          GCS x <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_VIRAL }} aria-hidden /> Protocolo Viral
        </h3>
        <p className="m-0 mt-1 text-[11.5px] text-ink-faint">
          GCS: vendas pagas, bruto de ticket e comissão a {f}%{faixa ? " (faixa sugerida)" : " (sem faixa sugerida ainda)"}; ticket médio = bruto ÷ vendas com
          ticket. Viral: faturamento = valor que o cliente pagou; comissão = mesma regra do GCS (líquido sem juros × {f}%).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px] tabular-nums">
          <thead className="text-[11.5px] text-ink-dim">
            <tr>
              <th className="py-1.5 pr-3 font-medium" rowSpan={2}>Vendedor</th>
              <th className="py-1 pr-3 text-center font-medium text-ink" colSpan={4}>GCS</th>
              <th className="py-1 pr-3 text-center font-medium text-ink" colSpan={4}>Protocolo Viral</th>
            </tr>
            <tr>
              <th className={th}>Vendas</th>
              <th className={th}>Faturamento</th>
              <th className={th}>Ticket médio</th>
              <th className={th}>Comissão {f}%</th>
              <th className={th}>Vendas</th>
              <th className={th}>Faturamento</th>
              <th className={th}>Ticket médio</th>
              <th className={th}>Comissão {f}%</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={9} className="py-3 italic text-ink-faint">Sem vendas pagas neste mês.</td>
              </tr>
            )}
            {linhas.map((l) => {
              return (
                <tr key={String(l.id)} className="border-t border-line-soft text-ink">
                  <td className="py-1.5 pr-3 text-white">{l.nome}</td>
                  <td className={td}>{l.gcs.qtd}</td>
                  <td className={td}>{formatBRLServidor(l.gcs.bruto)}</td>
                  <td className={td}>{medio(l.gcs.bruto, l.gcs.comTicket)}</td>
                  <td className={cn(td, "text-white")}>{formatBRLServidor(l.gcs.comissao)}</td>
                  <td className={td}>{l.viral.qtd}</td>
                  <td className={td}>{formatBRLServidor(l.viral.faturamento)}</td>
                  <td className={td}>{medio(l.viral.faturamento, l.viral.qtd)}</td>
                  <td className={cn(td, "text-white")}>
                    {formatBRLServidor(l.viral.comissao)}
                    {l.viral.semLiquido > 0 && <span className="ml-1 text-[11px] text-accent-3">({l.viral.semLiquido} sem valor da Hubla)</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-1">
          <h4 className="m-0 text-[13.5px] font-semibold text-white">Conversão do downsell</h4>
          {conversao.etiquetaDefinida ? (
            <>
              <p className="m-0 text-[13px] text-ink">
                <span className="tabular-nums text-white">{conversao.marcados}</span> lead{conversao.marcados === 1 ? "" : "s"} com a etiqueta 🪞 Downsell Viral no mês ·{" "}
                <span className="tabular-nums text-white">{conversao.compraram}</span> compr{conversao.compraram === 1 ? "ou" : "aram"} o Viral
                {conversao.marcados > 0 && (
                  <>
                    {" "}· <span className="font-semibold tabular-nums text-white">{Math.round((conversao.compraram / conversao.marcados) * 1000) / 10}%</span>
                  </>
                )}
              </p>
              <p className="m-0 text-[11.5px] text-ink-faint">
                Lead conta no mês em que recebeu a etiqueta; compra = venda do Viral ligada ao lead pelo telefone (sincronização do Funil). Vendas do Viral no
                mês, com ou sem etiqueta: {totalViral}.
              </p>
            </>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-faint">Etiqueta do downsell não configurada.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h4 className="m-0 text-[13.5px] font-semibold text-white">Vendas por oferta</h4>
          {precos.map((p) => (
            <div key={p} className="grid grid-cols-[64px_1fr_28px] items-center gap-2 text-[12.5px] tabular-nums">
              <span className={porPreco.get(p) ? "text-ink" : "text-ink-faint"}>{(p / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              <span className="h-2 rounded-full bg-bg-raised-2">
                {porPreco.get(p) ? <span className="block h-2 rounded-full" style={{ width: `${((porPreco.get(p) ?? 0) / max) * 100}%`, background: COR_VIRAL }} /> : null}
              </span>
              <span className={cn("text-right", porPreco.get(p) ? "text-white" : "text-ink-faint")}>{porPreco.get(p) ?? 0}</span>
            </div>
          ))}
        </div>
      </div>
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
