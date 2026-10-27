import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { duracao, hojeSP, lerPeriodo, minimoParaGap, type Chegada, type GrupoChegada, type Periodo, type TempoInicio } from "@/modulos/funil/calculo";
import {
  bmDosNumeros,
  carregarFunil,
  chegadaNoPeriodo,
  configDoFunil,
  leadsEmNumeroBanido,
  leadsEsperando,
  mudancasDoFunil,
  naoComecaram,
  nomesDosNumeros,
  opcoesDoFunil,
  primeiraResposta,
  statusDaSincronizacao,
  visaoPorAtendente,
  type Esperando,
  type Filas,
  type ItemFila,
  type LeadBanido,
  type NaoComecou,
  type StatusSincronizacao,
  type VisaoAtendentes,
} from "@/modulos/funil/dados";
import Link from "next/link";
import { Suspense } from "react";
import { BarrasConversao, BarrasPorDia, FunilEtapas, TabelaPorNumero } from "./_componentes/graficos";
import { SincronizarAgora } from "./_componentes/sincronizar-agora";

// Funil e Leads (v1). Contexto e regras em docs/modulos/funil.md; cálculo em modulos/funil/calculo.ts.
// Admin vê tudo e filtra por vendedor (= atendente da Data Crazy, o dono do lead desde 16/10/2026) e,
// em segundo plano, por número; o vendedor vê só o funil dele (garantido pelo RLS).

// b=1: filtro "Número banido" (lista os leads com conversa em número banido)
type Busca = { p?: string; de?: string; ate?: string; v?: string; n?: string; conv?: string; b?: string };
type Props = { searchParams: Promise<Busca> };

export default function FunilPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight">Funil e Leads</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Leads da Data Crazy pelas etiquetas, atualizados a cada 15 minutos.</p>
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

const pct = (x: number) => `${Math.round(x * 100)}%`;
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario) return null;
  const admin = usuario.papel === "admin";
  const sp = await searchParams;
  const hoje = hojeSP();
  const { periodo, desde, ate } = lerPeriodo(sp.p, sp.de, sp.ate, hoje);

  const opcoes = admin ? await opcoesDoFunil() : { vendedores: [], numeros: [] };
  const atendenteId = admin && opcoes.vendedores.some((v) => v.id === sp.v) ? sp.v! : null;
  const numeroId = admin && opcoes.numeros.some((n) => n.id === sp.n) ? sp.n! : null;
  const soBanido = sp.b === "1";

  // card, tooltip por número e tabela por número saem do MESMO resultado (uma leitura dos leads)
  const cfg = await configDoFunil();
  const [r, sync, nomes, esperando, respostas, bms, mudancas, chegada, parados, banidos, visao] = await Promise.all([
    carregarFunil({ desde, ate, atendenteId, numeroId }, cfg),
    statusDaSincronizacao(),
    nomesDosNumeros(),
    leadsEsperando(cfg, { atendenteId, numeroId }),
    primeiraResposta({ desde, ate, atendenteId, numeroId }, cfg),
    bmDosNumeros(),
    mudancasDoFunil(desde, ate),
    chegadaNoPeriodo({ desde, ate, atendenteId, numeroId }, cfg),
    naoComecaram({ atendenteId, numeroId }),
    soBanido ? leadsEmNumeroBanido({ atendenteId }) : null,
    visaoPorAtendente(cfg),
  ]);
  // marcas de mudança no funil, por dia
  const marcas = new Map<string, string[]>();
  for (const m of mudancas) marcas.set(m.dia, [...(marcas.get(m.dia) ?? []), m.etapa ? `${m.etapa}: ${m.descricao}` : m.descricao]);
  // conversão por dia: "aluno" (comprou) ou uma etapa (padrão: Parte 2)
  const padraoConv = r.funil.find((l) => l.nome === "Parte 2") ?? r.funil[2] ?? r.funil[0];
  const alvo = sp.conv === "aluno" ? "aluno" : (r.funil.find((l) => String(l.etapaId) === sp.conv) ?? padraoConv);
  const conversao = r.porDia.map((d) => ({
    dia: d.dia,
    base: d.noFunil,
    chegaram: alvo === "aluno" ? d.compraram : alvo ? (d.alcance[alvo.etapaId] ?? 0) : 0,
  }));
  // conversão por BM (soma dos números de cada BM)
  const porBm = new Map<string, { leads: number; compraram: number }>();
  for (const n of r.conversaoPorNumero) {
    const bm = n.numeroId ? (bms.get(n.numeroId) ?? "sem BM") : "ainda sem conversa";
    const g = porBm.get(bm) ?? { leads: 0, compraram: 0 };
    g.leads += n.leads;
    g.compraram += n.compraram;
    porBm.set(bm, g);
  }
  const contadoAte = sync.ultimaOk
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(sync.ultimaOk))
    : null;

  // links de período mantêm os filtros
  const filtros = new URLSearchParams();
  if (atendenteId) filtros.set("v", atendenteId);
  if (numeroId) filtros.set("n", numeroId);
  if (soBanido) filtros.set("b", "1");
  const linkPeriodo = (p: Periodo) => {
    const q = new URLSearchParams(filtros);
    q.set("p", p);
    if (p === "personalizado") {
      q.set("de", desde);
      q.set("ate", ate);
    }
    return `/funil?${q.toString()}`;
  };
  const linkConv = (c: string) => {
    const q = new URLSearchParams(filtros);
    q.set("p", periodo);
    if (periodo === "personalizado") {
      q.set("de", desde);
      q.set("ate", ate);
    }
    q.set("conv", c);
    return `/funil?${q.toString()}#conversao`;
  };
  // liga/desliga o filtro "Número banido" mantendo o resto
  const linkBanido = (() => {
    const q = new URLSearchParams(filtros);
    q.set("p", periodo);
    if (periodo === "personalizado") {
      q.set("de", desde);
      q.set("ate", ate);
    }
    if (soBanido) q.delete("b");
    else q.set("b", "1");
    return `/funil?${q.toString()}${soBanido ? "" : "#numero-banido"}`;
  })();

  const compradores = r.compradores.hubla + r.compradores.foraHubla;

  return (
    <>
      {admin && (
        <Link href="/funil/custo" className="self-start text-[12.5px] text-ink-dim underline-offset-4 hover:text-white hover:underline">
          Custo de mensagens do WhatsApp →
        </Link>
      )}
      <VisaoPorAtendente visao={visao} admin={admin} />

      {/* números principais */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Numero
          rotulo="Leads no período"
          valor={String(r.totalLeads)}
          detalhe={[contadoAte && `contado até ${contadoAte} (última sincronização)`, r.foraDoFunil && `${r.foraDoFunil} fora do funil`].filter(Boolean).join(" · ") || undefined}
        />
        <Numero
          rotulo="Maior gap"
          valor={r.maiorGap ? `−${pct(r.maiorGap.perda)}` : "—"}
          detalhe={r.maiorGap ? `${r.maiorGap.de} → ${r.maiorGap.para}` : "sem perda entre etapas"}
          alerta={!!r.maiorGap}
        />
        <Numero
          rotulo="Compradores (Aluno)"
          valor={String(compradores)}
          detalhe={`${r.compradores.hubla} Hubla · ${r.compradores.foraHubla} Pix/CNPJ${r.noFunil ? ` · ${pct(compradores / r.noFunil)} do funil` : ""}`}
        />
        <Numero
          rotulo="Aluno a conferir"
          valor={String(r.compradores.aConferir)}
          detalhe="etiqueta Aluno sem venda achada na Hubla"
          alerta={r.compradores.aConferir > 0}
        />
        <Numero
          rotulo="Chegaram e ainda não começaram"
          valor={String(parados.length)}
          detalhe={parados.length ? `o mais antigo espera há ${duracao(parados[0].esperaMs)} · últimos 7 dias` : "ninguém parado na chegada · últimos 7 dias"}
          alerta={parados.length > 0}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <AvisoSincronizacao sync={sync} />
        </div>
        {admin && <SincronizarAgora />}
      </div>

      {/* filtros: tudo numa linha acima dos gráficos */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <Link
            href={linkBanido}
            aria-pressed={soBanido}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              soBanido
                ? "border-[rgb(var(--tag-vermelho)/0.6)] bg-[rgb(var(--tag-vermelho)/0.12)] text-white"
                : "border-line text-ink-dim hover:text-white",
            )}
          >
            Número banido{soBanido ? " ✕" : ""}
          </Link>
        </div>
        <form method="get" action="/funil" className="flex flex-wrap items-end gap-3 text-xs text-ink-dim">
          <input type="hidden" name="p" value={periodo === "personalizado" ? "personalizado" : periodo} />
          {soBanido && <input type="hidden" name="b" value="1" />}
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
          {admin && (
            <>
              <label className="flex flex-col gap-1 font-medium text-ink">
                Vendedor (atendente)
                <select name="v" defaultValue={atendenteId ?? ""} className={cn(campo, "min-w-[180px] border-accent/40")}>
                  <option value="">Todos</option>
                  {opcoes.vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-ink-faint">
                Número (ativos)
                <select name="n" defaultValue={numeroId ?? ""} className={cn(campo, "max-w-[160px] py-1 text-[12px] text-ink-dim")}>
                  <option value="">Todos</option>
                  {opcoes.numeros.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nome}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {(admin || periodo === "personalizado") && (
            <button type="submit" className="rounded-full border border-line px-4 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:text-white">
              Aplicar
            </button>
          )}
          <span className="self-center text-[12px] text-ink-faint">
            {desde === ate ? dataBR(desde) : `${dataBR(desde)} a ${dataBR(ate)}`}
            {!admin && " · só os seus leads"}
          </span>
        </form>
      </section>

      {banidos && <LeadsNumeroBanido itens={banidos} admin={admin} />}
      <FilasDataCrazy filas={esperando.filas} admin={admin} emBanidos={esperando.abertasEmBanidos} />
      <NaoComecaram itens={parados} />
      <ListaEsperando
        id="esperando"
        titulo="Leads esperando resposta"
        itens={esperando.leads}
        horas={cfg.horasEspera}
        inicio={cfg.inicio}
        fim={cfg.fim}
        admin={admin}
      />
      <ChegadaDosLeads chegada={chegada} inicio={cfg.inicio} fim={cfg.fim} minutos={cfg.minutosResposta} admin={admin} />
      <TempoAteIniciar t={r.tempoInicio} inicio={cfg.inicio} fim={cfg.fim} etapa={r.funil[0]?.nome ?? "1ª etapa"} />
      <ListaEsperando
        id="aguardando-lead"
        titulo="Aguardando o lead"
        itens={esperando.aguardandoLead}
        horas={cfg.horasEspera}
        inicio={cfg.inicio}
        fim={cfg.fim}
        admin={false}
        tipo="aguardando"
      />

      <section className="glass-lite glass-static p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-white">Leads por dia</h2>
        <BarrasPorDia dias={r.porDia} nomes={nomes} marcas={marcas} />
      </section>

      <section className="glass-lite glass-static p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Leads por número</h2>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">
          Mesmos leads do card: cada lead uma vez, no número da primeira conversa. Quem ainda não conversou fica em “ainda sem conversa”.
        </p>
        <TabelaPorNumero porNumero={r.porNumero} total={r.totalLeads} nomes={nomes} />
      </section>

      <section className="glass-lite glass-static overflow-x-auto p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Funil por etapa</h2>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">
          Leads que chegaram no período (1ª mensagem ou etiqueta CL, o que vier primeiro) e chegaram em cada etapa (quem chegou numa etapa conta
          nas anteriores). A CL marca a chegada, não é etapa: a passagem de Chegou para a 1ª etapa não conta como perda. Perda = quanto caiu em relação à
          etapa de cima. Maior gap: só entre etapas com pelo menos {minimoParaGap(r.noFunil)} leads na de cima.
        </p>
        <FunilEtapas linhas={r.funil} total={r.noFunil} semInicio={r.semInicio} gapPara={r.maiorGap?.para ?? null} />
      </section>

      <section id="conversao" className="glass-lite glass-static scroll-mt-28 p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Conversão por dia</h2>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">Dos leads do funil que entraram em cada dia, a % que chegou no alvo. Linhas tracejadas = mudanças registradas no funil.</p>
        <nav className="mb-3 flex flex-wrap gap-1.5" aria-label="Alvo da conversão">
          {[{ id: "aluno", nome: "Virou Aluno" }, ...r.funil.map((l) => ({ id: String(l.etapaId), nome: `Chegou em ${l.nome}` }))].map((o) => {
            const ativo = alvo === "aluno" ? o.id === "aluno" : o.id === String(alvo?.etapaId);
            return (
              <Link
                key={o.id}
                href={linkConv(o.id)}
                aria-current={ativo ? "true" : undefined}
                className={cn("rounded-full px-3 py-1 text-[12px] transition-colors", ativo ? "bg-accent/15 text-white" : "text-ink-dim hover:text-white")}
              >
                {o.nome}
              </Link>
            );
          })}
        </nav>
        <BarrasConversao dias={conversao} marcas={marcas} />
        {mudancas.length > 0 && (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1 border-t border-line-soft p-0 pt-2 text-[12.5px] text-ink-dim">
            {mudancas.map((m) => (
              <li key={m.id}>
                <span className="tabular-nums text-ink-faint">{dataBR(m.dia)}</span> · {m.etapa ? `${m.etapa}: ` : ""}
                {m.descricao}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-lite glass-static p-4">
          <h2 className="mb-1 text-[15px] font-semibold text-white">Tempo de primeira resposta</h2>
          <p className="m-0 mb-3 text-[12px] text-ink-faint">
            1ª mensagem do lead → 1ª resposta de um atendente (sem automação e sem suporte Data Crazy), contando só o horário de atendimento ({cfg.inicio}–{cfg.fim}).
          </p>
          {respostas.length === 0 ? (
            <p className="m-0 py-4 text-center text-[13px] italic text-ink-faint">Ainda sem respostas medidas neste período.</p>
          ) : (
            <table className="w-full border-collapse text-left text-[13px] tabular-nums">
              <thead className="text-[11.5px] text-ink-dim">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Quem respondeu</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Leads</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Média</th>
                  <th className="py-1.5 text-right font-medium">Mediana</th>
                </tr>
              </thead>
              <tbody>
                {respostas.map((x) => (
                  <tr key={x.vendedor} className="border-t border-line-soft text-ink">
                    <td className="py-1.5 pr-3">{x.vendedor}</td>
                    <td className="py-1.5 pr-3 text-right">{x.leads}</td>
                    <td className="py-1.5 pr-3 text-right text-white">{duracao(x.mediaMs)}</td>
                    <td className="py-1.5 text-right text-white">{duracao(x.medianaMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="glass-lite glass-static overflow-x-auto p-4">
          <h2 className="mb-1 text-[15px] font-semibold text-white">Conversão por BM e por número</h2>
          <p className="m-0 mb-3 text-[12px] text-ink-faint">Leads que entraram no período (cada um no número da primeira conversa) e quantos compraram (Hubla ou Pix/CNPJ).</p>
          <TabelaConversao linhas={[...porBm.entries()].map(([nome, g]) => ({ nome, ...g }))} titulo="BM" />
          <div className="mt-4">
            <TabelaConversao linhas={r.conversaoPorNumero.map((n) => ({ nome: n.numeroId ? (nomes.get(n.numeroId) ?? "número sem nome") : "ainda sem conversa", leads: n.leads, compraram: n.compraram }))} titulo="Número" />
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-lite glass-static p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-white">Perdas por motivo</h2>
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Motivo</th>
                <th className="py-1.5 pr-3 font-medium">Onde</th>
                <th className="py-1.5 pr-3 text-right font-medium">Leads</th>
                <th className="py-1.5 text-right font-medium">% do funil</th>
              </tr>
            </thead>
            <tbody>
              {r.perdas.map((p) => (
                <tr key={p.nome} className="border-t border-line-soft text-ink">
                  <td className="py-1.5 pr-3">{p.nome}</td>
                  <td className="py-1.5 pr-3 text-ink-dim">{p.onde ?? "objeção"}</td>
                  <td className="py-1.5 pr-3 text-right text-white">{p.qtd}</td>
                  <td className="py-1.5 text-right text-ink-dim">{r.noFunil ? pct(p.pct) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="glass-lite glass-static p-4">
          <h2 className="mb-1 text-[15px] font-semibold text-white">Tempo médio entre etapas</h2>
          <p className="m-0 mb-3 text-[12px] text-ink-faint">Só leads que passaram pelas duas etapas, com a data real do histórico.</p>
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <tbody>
              {r.tempos.map((t) => (
                <tr key={`${t.de}-${t.para}`} className="border-t border-line-soft text-ink first:border-t-0">
                  <td className="py-1.5 pr-3">
                    {t.de} → {t.para}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-white">{t.mediaMs === null ? "—" : duracao(t.mediaMs)}</td>
                  <td className="py-1.5 text-right text-[12px] text-ink-faint">{t.leads ? `${t.leads} lead${t.leads === 1 ? "" : "s"}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

const campo = "rounded-lg border border-line bg-bg-raised-2 px-2.5 py-1.5 text-[13px] text-ink [color-scheme:dark]";

// cores da barra de distribuição (uma por atendente; "Sem atendente" fica laranja)
const CORES = ["bg-accent", "bg-[rgb(var(--tag-roxo))]", "bg-[rgb(var(--tag-verde))]", "bg-[rgb(var(--tag-azul))]", "bg-[rgb(var(--tag-amarelo))]"];

/** Um card por atendente (o dono do lead), o card "Sem atendente" e a distribuição dos leads de hoje. */
function VisaoPorAtendente({ visao, admin }: { visao: VisaoAtendentes; admin: boolean }) {
  const s = visao.semAtendente;
  const cor = (id: string | null, i: number) => (id === null ? "bg-[rgb(var(--tag-laranja))]" : CORES[i % CORES.length]);
  return (
    <section id="atendentes" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-white">Hoje por atendente</h2>
        <p className="m-0 text-[12px] text-ink-faint">
          O dono do lead é o atendente da conversa na Data Crazy (o número é só detalhe).{!admin && " Só os seus leads."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visao.cards.map((c) => (
          <div key={c.id} className="glass-lite glass-static flex flex-col gap-2 p-4">
            <p className="m-0 text-[14px] font-semibold text-white">{c.nome}</p>
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[12.5px] tabular-nums">
              <dt className="text-ink-dim">Leads recebidos hoje</dt>
              <dd className="m-0 text-right text-[15px] font-semibold text-white">{c.leadsHoje}</dd>
              <dt className="text-ink-dim">Em atendimento agora</dt>
              <dd className="m-0 text-right text-white">{c.emAtendimento}</dd>
              <dt className="text-ink-dim">Aguardando resposta dele</dt>
              <dd className={cn("m-0 text-right", c.aguardando ? "font-semibold text-[rgb(var(--tag-laranja))]" : "text-white")}>{c.aguardando}</dd>
              <dt className="text-ink-dim">Vendas hoje</dt>
              <dd className="m-0 text-right text-white">{c.vendasHoje ?? <span className="text-ink-faint">—</span>}</dd>
              <dt className="text-ink-dim">1ª resposta (média)</dt>
              <dd className="m-0 text-right text-white">
                {c.primeiraRespostaMs === null ? <span className="text-ink-faint">—</span> : duracao(c.primeiraRespostaMs)}
                {c.respondidos > 0 && <span className="text-ink-faint"> · {c.respondidos}</span>}
              </dd>
            </dl>
          </div>
        ))}
        <div className={cn("glass-lite glass-static flex flex-col gap-2 p-4", s.leads > 0 && "border-[rgb(var(--tag-laranja)/0.5)]")}>
          <p className="m-0 text-[14px] font-semibold text-white">Sem atendente</p>
          <p className={cn("m-0 text-[26px] font-semibold tabular-nums", s.leads ? "text-[rgb(var(--tag-laranja))]" : "text-white")}>{s.leads}</p>
          <p className="m-0 text-[12px] text-ink-dim">
            {s.maisAntigoMs === null ? "nenhum lead sem dono agora" : `leads sem dono · o mais antigo espera há ${duracao(s.maisAntigoMs)}`}
          </p>
        </div>
      </div>
      <div className="glass-lite glass-static p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ink">Distribuição dos leads de hoje · {visao.totalHoje}</h3>
          <span className="text-[11.5px] text-ink-faint">para conferir se o rodízio está equilibrado</span>
        </div>
        {visao.totalHoje === 0 ? (
          <p className="m-0 text-[12.5px] italic text-ink-faint">Nenhum lead hoje ainda.</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-raised-2" role="img" aria-label="Distribuição dos leads de hoje por atendente">
              {visao.distribuicao
                .filter((d) => d.leads > 0)
                .map((d, i) => (
                  <div key={d.id ?? "sem"} className={cor(d.id, i)} style={{ width: `${(d.leads / visao.totalHoje) * 100}%` }} title={`${d.nome}: ${d.leads}`} />
                ))}
            </div>
            <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px] tabular-nums text-ink-dim">
              {visao.distribuicao
                .filter((d) => d.leads > 0)
                .map((d, i) => (
                  <li key={d.id ?? "sem"} className="inline-flex items-center gap-1.5">
                    <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", cor(d.id, i))} />
                    {d.nome} {Math.round((d.leads / visao.totalHoje) * 100)}% <span className="text-ink-faint">({d.leads})</span>
                  </li>
                ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function Numero({ rotulo, valor, detalhe, alerta = false }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="glass-lite glass-static flex flex-col gap-1 p-4">
      <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">{rotulo}</p>
      <p className={cn("text-[26px] font-semibold tabular-nums", alerta ? "text-[rgb(var(--tag-vermelho))]" : "text-white")}>{valor}</p>
      {detalhe && <p className="text-[12px] text-ink-dim">{detalhe}</p>}
    </div>
  );
}

/** "Atualizado às 09:45" e aviso se a última rodada falhou ou se está parada há mais de 45 min. */
function AvisoSincronizacao({ sync }: { sync: StatusSincronizacao }) {
  const hora = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const u = sync.ultima;
  if (!u) return <p className="m-0 text-[12.5px] text-[rgb(var(--tag-laranja))]">Ainda não houve sincronização com a Data Crazy.</p>;

  const falhou = u.situacao === "falhou";
  const referencia = sync.ultimaOk ?? u.iniciada_em;
  // eslint-disable-next-line react-hooks/purity -- página dinâmica, renderizada a cada acesso
  const parada = Date.now() - Date.parse(referencia) > 45 * 60_000;

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-[12.5px]",
        falhou || parada ? "border-[rgb(var(--tag-vermelho)/0.5)] text-[rgb(var(--tag-vermelho))]" : "border-line-soft text-ink-dim",
      )}
      role={falhou || parada ? "alert" : undefined}
    >
      {sync.ultimaOk ? `Última sincronização: ${hora(sync.ultimaOk)}.` : "Nenhuma sincronização completa ainda."}
      {falhou && ` A rodada de ${hora(u.iniciada_em)} falhou: ${u.erro ?? "erro sem detalhe"}.`}
      {!falhou && parada && " Mais de 45 minutos sem sincronizar: confira o cron do Supabase."}
      {u.situacao === "rodando" && !parada && " Sincronizando agora…"}
    </div>
  );
}

/** Filas da Data Crazy: Não iniciados + Em atendimento numa lista (coluna Situação) e Aguardando. */
function FilasDataCrazy({ filas, admin, emBanidos }: { filas: Filas; admin: boolean; emBanidos: number }) {
  const naoIniciados = filas.atendimento.filter((f) => f.situacao === "nao_iniciado").length;
  return (
    <section id="filas" className="glass-lite glass-static scroll-mt-28 p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-white">Filas da Data Crazy · {filas.total} conversas abertas</h2>
        <span className="text-[12.5px] tabular-nums text-ink-dim">
          Não iniciados {naoIniciados} · Em atendimento {filas.atendimento.length - naoIniciados} · Aguardando {filas.aguardando.length}
        </span>
      </div>
      <p className="m-0 mb-3 text-[12px] text-ink-faint">
        Não iniciado = ninguém assumiu o atendimento. Conversas em número banido ficam fora. Uma linha por lead (o mesmo lead em dois números aparece uma vez, com os números juntos). O Aguardando (o lead espera a empresa) pode repetir um lead da outra lista, como no CRM. O tempo é real (não só
        o horário de atendimento): no Aguardando, desde a última mensagem do lead; na outra, desde o início do atendimento atual. Atualiza a cada 15 minutos.
        {!admin && " Só as suas conversas (as que ninguém assumiu ainda não têm vendedor)."}
      </p>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <TabelaFila titulo="Não iniciados e em atendimento" itens={filas.atendimento} comSituacao />
        <TabelaFila titulo="Aguardando" detalhe="o lead espera a empresa" itens={filas.aguardando} />
      </div>
      {emBanidos > 0 && (
        // conversas de número banido ficam fora das filas, das listas e dos totais
        <Link href="/funil?b=1#numero-banido" className="mt-3 inline-block text-[12px] text-ink-faint underline-offset-4 hover:text-ink-dim hover:underline">
          {emBanidos} {emBanidos === 1 ? "conversa aberta" : "conversas abertas"} em números banidos
        </Link>
      )}
    </section>
  );
}

function TabelaFila({
  titulo,
  detalhe,
  itens,
  comSituacao = false,
}: {
  titulo: string;
  detalhe?: string;
  itens: (Esperando & { situacao?: ItemFila["situacao"] })[];
  comSituacao?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <h3 className="mb-1 text-[13px] font-semibold text-ink">
        {titulo} · {itens.length} {detalhe && <span className="font-normal text-ink-faint">({detalhe})</span>}
      </h3>
      {itens.length === 0 ? (
        <p className="m-0 py-2 text-[13px] italic text-ink-faint">Ninguém nesta fila.</p>
      ) : (
        <table className="w-full border-collapse text-left text-[13px] tabular-nums">
          <thead className="text-[11.5px] text-ink-dim">
            <tr>
              {comSituacao && <th className="py-1.5 pr-3 font-medium">Situação</th>}
              <th className="py-1.5 pr-3 font-medium">Lead</th>
              <th className="py-1.5 pr-3 font-medium">Vendedor</th>
              <th className="py-1.5 pr-3 font-medium">Número</th>
              <th className="py-1.5 pr-3 font-medium">Etapa</th>
              <th className="py-1.5 text-right font-medium">Na fila há</th>
            </tr>
          </thead>
          <tbody>
            {itens.slice(0, 100).map((e) => (
              <tr key={e.conversaId} className="border-t border-line-soft text-ink">
                {comSituacao && (
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    {e.situacao === "nao_iniciado" ? (
                      <span className="font-semibold text-[rgb(var(--tag-laranja))]">Não iniciado</span>
                    ) : (
                      <span className="text-ink-dim">Em atendimento</span>
                    )}
                  </td>
                )}
                <td className="py-1.5 pr-3 text-white">{e.rotulo ?? "—"}</td>
                <td className="py-1.5 pr-3">{e.vendedor ?? <span className="text-ink-faint">ninguém</span>}</td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-[12px] text-ink-faint">{e.numeros.join(" · ") || "—"}</td>
                <td className="py-1.5 pr-3 text-ink-dim">{e.etapa ?? "—"}</td>
                <td className="whitespace-nowrap py-1.5 text-right font-semibold text-white">{duracao(e.esperaMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Leads sem atendimento na chegada (no período): fora do horário, dentro do horário sem atendente em
 * até X minutos e atendidos a tempo, com tempo médio até a 1ª resposta e conversão em Aluno; e os
 * leads por hora de chegada.
 */
function ChegadaDosLeads({ chegada: c, inicio, fim, minutos, admin }: { chegada: Chegada; inicio: string; fim: string; minutos: number; admin: boolean }) {
  const grupos: { nome: string; detalhe: string; g: GrupoChegada; alerta: boolean }[] = [
    { nome: "Fora do horário", detalhe: `1ª mensagem fora das ${inicio}–${fim}`, g: c.fora, alerta: c.fora.leads > 0 },
    { nome: "Dentro do horário, sem atendente", detalhe: `sem resposta de atendente em até ${minutos} min`, g: c.semAtendente, alerta: c.semAtendente.leads > 0 },
    { nome: "Atendidos a tempo", detalhe: `resposta de atendente em até ${minutos} min`, g: c.aTempo, alerta: false },
  ];
  const max = Math.max(1, ...c.porHora.map((h) => h.qtd));
  return (
    <section id="chegada" className="glass-lite glass-static scroll-mt-28 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-white">Leads sem atendimento na chegada · {c.total} leads no período</h2>
        {admin && (
          <Link href="/funil/config" className="text-[12px] text-ink-dim underline-offset-4 hover:underline">
            Configurar horário e minutos
          </Link>
        )}
      </div>
      <p className="m-0 mb-3 text-[12px] text-ink-faint">
        Chegada = 1ª mensagem do lead ou etiqueta CL, o que vier primeiro. Resposta = 1ª mensagem de atendente de verdade (automação e suporte Data Crazy não contam). Tempos em
        tempo real (a madrugada conta). Aluno = venda na Hubla ou Pix/CNPJ.
        {c.noPrazo > 0 && ` ${c.noPrazo} lead(s) chegaram há menos de ${minutos} min e ainda estão no prazo (fora dos grupos).`}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {grupos.map(({ nome, detalhe, g, alerta }) => (
          <div key={nome} className={cn("rounded-xl border border-line-soft p-3", alerta && "border-[rgb(var(--tag-laranja)/0.5)]")}>
            <p className="m-0 text-[12.5px] font-semibold text-ink">{nome}</p>
            <p className="m-0 text-[11.5px] text-ink-faint">{detalhe}</p>
            <p className="m-0 mt-2 flex items-baseline gap-2">
              <span className={cn("text-[26px] font-semibold tabular-nums", alerta ? "text-[rgb(var(--tag-laranja))]" : "text-white")}>{g.leads}</span>
              <span className="text-[12.5px] tabular-nums text-ink-dim">{pctOuTraco(c.total ? g.pct : null)} do total</span>
            </p>
            <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px] tabular-nums">
              <dt className="text-ink-dim">1ª resposta (média)</dt>
              <dd className="m-0 text-right text-white">
                {g.mediaMs === null ? "—" : duracao(g.mediaMs)}
                <span className="text-ink-faint">
                  {" "}
                  · {g.respondidos} de {g.leads} respondidos
                </span>
              </dd>
              <dt className="text-ink-dim">Viraram Aluno</dt>
              <dd className="m-0 text-right text-white">
                {pctOuTraco(g.conversao)}
                <span className="text-ink-faint"> · {g.alunos}</span>
              </dd>
            </dl>
          </div>
        ))}
      </div>

      <h3 className="mb-2 mt-5 text-[13px] font-semibold text-ink">Leads por hora de chegada</h3>
      <div className="flex h-36 items-end gap-[3px]" role="img" aria-label="Leads por hora de chegada, de 0h a 23h">
        {c.porHora.map((h) => (
          <div
            key={h.hora}
            className={cn("relative flex h-full flex-1 flex-col justify-end rounded-t-[3px]", h.fora && "bg-[rgb(var(--tag-laranja)/0.08)]")}
            title={`${h.hora}h: ${h.qtd} lead(s)${h.fora ? " · fora do horário" : ""}`}
          >
            <span className="mb-0.5 text-center text-[10px] tabular-nums text-ink-faint">{h.qtd || ""}</span>
            <div
              className={cn("w-full rounded-t-[3px]", h.fora ? "bg-[rgb(var(--tag-laranja))]" : "bg-accent")}
              style={{ height: h.qtd ? `${Math.max(3, (h.qtd / max) * 85)}%` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] text-center text-[10px] tabular-nums text-ink-faint">
        {c.porHora.map((h) => (
          <span key={h.hora} className="flex-1">
            {h.hora}
          </span>
        ))}
      </div>
      <p className="m-0 mt-2 flex items-center gap-3 text-[11.5px] text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[rgb(var(--tag-laranja))]" /> fora do horário ({fim}–{inicio})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" /> dentro do horário
        </span>
      </p>
    </section>
  );
}

const pctOuTraco = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Leads (ou alunos) esperando resposta de um atendente há mais de X horas de atendimento. */
function ListaEsperando({
  id,
  titulo,
  itens,
  horas,
  inicio,
  fim,
  admin,
  tipo = "lead",
}: {
  id: string;
  titulo: string;
  itens: Esperando[];
  horas: number;
  inicio: string;
  fim: string;
  admin: boolean;
  /** lead / aluno: a vez é da empresa · aguardando: a vez é do lead */
  tipo?: "lead" | "aluno" | "aguardando";
}) {
  const aguardando = tipo === "aguardando";
  return (
    // scroll-mt: ao abrir pelo link (#esperando), o título não fica escondido atrás do menu fixo do topo
    <section id={id} className={cn("glass-lite glass-static scroll-mt-28 p-4", itens.length > 0 && !aguardando && "border-[rgb(var(--tag-laranja)/0.5)]")}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-white">
          {titulo} · {itens.length}
        </h2>
        {admin && (
          <Link href="/funil/config" className="text-[12px] text-ink-dim underline-offset-4 hover:underline">
            Configurar horário, espera e mudanças
          </Link>
        )}
      </div>
      <p className="m-0 mb-3 text-[12px] text-ink-faint">
        {aguardando
          ? "A última mensagem é da empresa (atendente ou automação) e o lead não responde. Candidatos a follow-up e ao webinar de downsell (alunos ficam fora). "
          : `${tipo === "aluno" ? "Contatos com etiqueta de Aluno (suporte). " : "Sem etiqueta de Aluno. "}A última mensagem é do lead e nenhuma mensagem da empresa veio depois (atendente ou automação). `}
        Só conversa em aberto na Data Crazy (finalizada não entra), há mais de {String(horas).replace(".", ",")}h de atendimento ({inicio}–{fim}). Lead em mais de um
        número aparece uma vez, com o maior tempo. Atualiza a cada 15 minutos.
      </p>
      {itens.length === 0 ? (
        <p className="m-0 py-2 text-center text-[13px] italic text-ink-faint">{aguardando ? "Nenhum lead parado." : "Ninguém esperando. 👌"}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{tipo === "aluno" ? "Aluno" : "Lead"}</th>
                <th className="py-1.5 pr-3 font-medium">Vendedor</th>
                <th className="py-1.5 pr-3 font-medium">Número</th>
                <th className="py-1.5 pr-3 font-medium">{aguardando ? "Parou em" : "Etapa atual"}</th>
                <th className="py-1.5 text-right font-medium">{aguardando ? "Sem responder há" : "Esperando"}</th>
              </tr>
            </thead>
            <tbody>
              {itens.slice(0, 100).map((e) => (
                <tr key={e.conversaId} className="border-t border-line-soft text-ink">
                  <td className="py-1.5 pr-3 text-white">{e.rotulo ?? "—"}</td>
                  <td className="py-1.5 pr-3">{e.vendedor ?? <span className="text-ink-faint">ninguém</span>}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-[12px] text-ink-faint">{e.numeros.length ? e.numeros.join(" · ") : "—"}</td>
                  <td className="py-1.5 pr-3 text-ink-dim">{e.etapa ?? "—"}</td>
                  <td className={cn("whitespace-nowrap py-1.5 text-right font-semibold", aguardando ? "text-ink" : "text-[rgb(var(--tag-laranja))]")}>{duracao(e.esperaMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {itens.length > 100 && <p className="m-0 mt-2 text-[12px] text-ink-faint">Mostrando os 100 que esperam há mais tempo.</p>}
        </div>
      )}
    </section>
  );
}

/** Filtro "Número banido": leads com conversa em número banido (aba BMs), para retomar por outro número. */
function LeadsNumeroBanido({ itens, admin }: { itens: LeadBanido[]; admin: boolean }) {
  const hora = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const orfaos = itens.filter((e) => e.outros.length === 0).length;
  return (
    <section id="numero-banido" className={cn("glass-lite glass-static scroll-mt-28 p-4", orfaos > 0 && "border-[rgb(var(--tag-vermelho)/0.5)]")}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-white">
          Leads em número banido · {itens.length}
          {itens.length > 0 && <span className="font-normal text-ink-dim"> ({orfaos} sem outro número)</span>}
        </h2>
        {admin && (
          <Link href="/bms" className="text-[12px] text-ink-dim underline-offset-4 hover:underline">
            Marcar número como banido na aba BMs
          </Link>
        )}
      </div>
      <p className="m-0 mb-3 text-[12px] text-ink-faint">
        Leads com conversa num número marcado como Banido na aba BMs (qualquer data, conversa aberta ou finalizada). Etapa e vendedor vêm da conversa mais recente (sem eles, do lead).
        Primeiro quem não tem conversa em nenhum outro número (esses ficaram órfãos); quem já está em outro número mostra qual. Atualiza a cada 15 minutos.
      </p>
      {itens.length === 0 ? (
        <p className="m-0 py-2 text-center text-[13px] italic text-ink-faint">Nenhum lead em número banido.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Lead</th>
                <th className="py-1.5 pr-3 font-medium">Vendedor</th>
                <th className="py-1.5 pr-3 font-medium">Etapa</th>
                <th className="py-1.5 pr-3 font-medium">Número banido</th>
                <th className="py-1.5 pr-3 font-medium">Outro número</th>
                <th className="py-1.5 text-right font-medium">Última mensagem</th>
              </tr>
            </thead>
            <tbody>
              {itens.slice(0, 300).map((e) => (
                <tr key={e.chave} className="border-t border-line-soft text-ink">
                  <td className="py-1.5 pr-3 text-white">{e.rotulo ?? "—"}</td>
                  <td className="py-1.5 pr-3">{e.vendedor ?? <span className="text-ink-faint">ninguém</span>}</td>
                  <td className="py-1.5 pr-3 text-ink-dim">{e.etapa ?? "—"}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-[12px] text-[rgb(var(--tag-vermelho)/0.8)]">{e.banidos.join(" · ")}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-[12px] text-ink-faint">
                    {e.outros.length ? e.outros.join(" · ") : <span className="font-semibold text-[rgb(var(--tag-laranja))]">nenhum</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right text-ink-dim">{e.ultimaEm ? hora(e.ultimaEm) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {itens.length > 300 && <p className="m-0 mt-2 text-[12px] text-ink-faint">Mostrando os 300 primeiros.</p>}
        </div>
      )}
    </section>
  );
}

/** Chegaram (1ª mensagem ou CL) e ainda não têm etiqueta de etapa: ninguém começou o atendimento. */
function NaoComecaram({ itens }: { itens: NaoComecou[] }) {
  const hora = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <section id="nao-comecaram" className={cn("glass-lite glass-static scroll-mt-28 p-4", itens.length > 0 && "border-[rgb(var(--tag-laranja)/0.5)]")}>
      <h2 className="mb-1 text-[15px] font-semibold text-white">Chegaram e ainda não começaram · {itens.length}</h2>
      <p className="m-0 mb-3 text-[12px] text-ink-faint">
        Leads dos últimos 7 dias que chegaram (1ª mensagem ou etiqueta CL) e ainda não têm nenhuma etiqueta de etapa. Fora do funil e quem já comprou não entram. Tempo
        real desde a chegada. Atualiza a cada 15 minutos.
      </p>
      {itens.length === 0 ? (
        <p className="m-0 py-2 text-center text-[13px] italic text-ink-faint">Todo mundo que chegou já começou. 👌</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Lead</th>
                <th className="py-1.5 pr-3 font-medium">Vendedor</th>
                <th className="py-1.5 pr-3 font-medium">Número</th>
                <th className="py-1.5 pr-3 font-medium">Chegou</th>
                <th className="py-1.5 text-right font-medium">Esperando há</th>
              </tr>
            </thead>
            <tbody>
              {itens.slice(0, 100).map((e) => (
                <tr key={e.leadId} className="border-t border-line-soft text-ink">
                  <td className="py-1.5 pr-3 text-white">{e.rotulo ?? "—"}</td>
                  <td className="py-1.5 pr-3">{e.vendedor ?? <span className="text-ink-faint">ninguém</span>}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-[12px] text-ink-faint">{e.numero ?? "—"}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-ink-dim">{hora(e.chegada)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right font-semibold text-[rgb(var(--tag-laranja))]">{duracao(e.esperaMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {itens.length > 100 && <p className="m-0 mt-2 text-[12px] text-ink-faint">Mostrando os 100 que esperam há mais tempo.</p>}
        </div>
      )}
    </section>
  );
}

/** Tempo até iniciar o atendimento: chegada → 1ª etiqueta de etapa, dentro e fora do horário. */
function TempoAteIniciar({ t, inicio, fim, etapa }: { t: { dentro: TempoInicio; fora: TempoInicio }; inicio: string; fim: string; etapa: string }) {
  const grupos = [
    { nome: "Chegou dentro do horário", detalhe: `${inicio}–${fim}`, g: t.dentro },
    { nome: "Chegou fora do horário", detalhe: `${fim}–${inicio} (a madrugada conta)`, g: t.fora },
  ];
  return (
    <section id="inicio-atendimento" className="glass-lite glass-static scroll-mt-28 p-4">
      <h2 className="mb-1 text-[15px] font-semibold text-white">Tempo até iniciar o atendimento</h2>
      <p className="m-0 mb-3 text-[12px] text-ink-faint">
        Da chegada (1ª mensagem ou etiqueta CL) até a 1ª etiqueta de etapa ({etapa}), dos leads do funil que chegaram no período. Tempo real. Só entram datas reais do
        histórico da Data Crazy.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {grupos.map(({ nome, detalhe, g }) => (
          <div key={nome} className="rounded-xl border border-line-soft p-3">
            <p className="m-0 text-[12.5px] font-semibold text-ink">{nome}</p>
            <p className="m-0 text-[11.5px] text-ink-faint">{detalhe}</p>
            <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px] tabular-nums">
              <dt className="text-ink-dim">Média</dt>
              <dd className="m-0 text-right text-[15px] font-semibold text-white">{g.mediaMs === null ? "—" : duracao(g.mediaMs)}</dd>
              <dt className="text-ink-dim">Mediana</dt>
              <dd className="m-0 text-right text-[15px] font-semibold text-white">{g.medianaMs === null ? "—" : duracao(g.medianaMs)}</dd>
              <dt className="text-ink-dim">Já começaram</dt>
              <dd className="m-0 text-right text-ink">
                {g.iniciados} de {g.leads}
              </dd>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function TabelaConversao({ linhas, titulo }: { linhas: { nome: string; leads: number; compraram: number }[]; titulo: string }) {
  const ordenadas = [...linhas].sort((a, b) => b.leads - a.leads);
  return (
    <table className="w-full border-collapse text-left text-[13px] tabular-nums">
      <thead className="text-[11.5px] text-ink-dim">
        <tr>
          <th className="py-1.5 pr-3 font-medium">{titulo}</th>
          <th className="py-1.5 pr-3 text-right font-medium">Leads</th>
          <th className="py-1.5 pr-3 text-right font-medium">Compraram</th>
          <th className="py-1.5 text-right font-medium">Conversão</th>
        </tr>
      </thead>
      <tbody>
        {ordenadas.map((l) => (
          <tr key={l.nome} className="border-t border-line-soft text-ink">
            <td className="whitespace-nowrap py-1.5 pr-3">{l.nome}</td>
            <td className="py-1.5 pr-3 text-right">{l.leads}</td>
            <td className="py-1.5 pr-3 text-right">{l.compraram}</td>
            <td className="py-1.5 text-right text-white">{l.leads ? pct(l.compraram / l.leads) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
