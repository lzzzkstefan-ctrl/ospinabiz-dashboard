import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { duracao, hojeSP, lerPeriodo, minimoParaGap, type Periodo } from "@/modulos/funil/calculo";
import {
  bmDosNumeros,
  carregarFunil,
  configDoFunil,
  leadsEsperando,
  mudancasDoFunil,
  nomesDosNumeros,
  opcoesDoFunil,
  primeiraResposta,
  statusDaSincronizacao,
  type Esperando,
  type Filas,
  type StatusSincronizacao,
} from "@/modulos/funil/dados";
import Link from "next/link";
import { Suspense } from "react";
import { BarrasConversao, BarrasPorDia, FunilEtapas, TabelaPorNumero } from "./_componentes/graficos";
import { SincronizarAgora } from "./_componentes/sincronizar-agora";

// Funil e Leads (v1). Contexto e regras em docs/modulos/funil.md; cálculo em modulos/funil/calculo.ts.
// Admin vê tudo e filtra por vendedor/número; o vendedor vê só o funil dele (garantido pelo RLS).

type Busca = { p?: string; de?: string; ate?: string; v?: string; n?: string; conv?: string };
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
  const vendedorId = admin && opcoes.vendedores.some((v) => String(v.id) === sp.v) ? Number(sp.v) : null;
  const numeroId = admin && opcoes.numeros.some((n) => n.id === sp.n) ? sp.n! : null;

  // card, tooltip por número e tabela por número saem do MESMO resultado (uma leitura dos leads)
  const cfg = await configDoFunil();
  const [r, sync, nomes, esperando, respostas, bms, mudancas] = await Promise.all([
    carregarFunil({ desde, ate, vendedorId, numeroId }),
    statusDaSincronizacao(),
    nomesDosNumeros(),
    leadsEsperando(cfg, { vendedorId, numeroId }),
    primeiraResposta({ desde, ate, vendedorId, numeroId }, cfg),
    bmDosNumeros(),
    mudancasDoFunil(desde, ate),
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
  if (vendedorId) filtros.set("v", String(vendedorId));
  if (numeroId) filtros.set("n", numeroId);
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

  const compradores = r.compradores.hubla + r.compradores.foraHubla;

  return (
    <>
      {/* números principais */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <AvisoSincronizacao sync={sync} />
        </div>
        {admin && <SincronizarAgora />}
      </div>

      {/* filtros: tudo numa linha acima dos gráficos */}
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
        <form method="get" action="/funil" className="flex flex-wrap items-end gap-3 text-xs text-ink-dim">
          <input type="hidden" name="p" value={periodo === "personalizado" ? "personalizado" : periodo} />
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
              <label className="flex flex-col gap-1">
                Vendedor
                <select name="v" defaultValue={vendedorId ? String(vendedorId) : ""} className={campo}>
                  <option value="">Todos</option>
                  {opcoes.vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                Número de WhatsApp
                <select name="n" defaultValue={numeroId ?? ""} className={cn(campo, "max-w-[220px]")}>
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

      <FilasDataCrazy filas={esperando.filas} admin={admin} />
      <ListaEsperando
        id="esperando"
        titulo="Leads esperando resposta"
        itens={esperando.leads}
        horas={cfg.horasEspera}
        inicio={cfg.inicio}
        fim={cfg.fim}
        admin={admin}
      />
      <ListaEsperando
        id="alunos-esperando"
        titulo="Alunos esperando (suporte)"
        itens={esperando.alunos}
        horas={cfg.horasEspera}
        inicio={cfg.inicio}
        fim={cfg.fim}
        admin={false}
        tipo="aluno"
      />
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
          Leads que entraram no período e chegaram em cada etapa (quem chegou numa etapa conta nas anteriores). Perda = quanto caiu em relação à
          etapa de cima. Maior gap: só entre etapas com pelo menos {minimoParaGap(r.noFunil)} leads na de cima.
        </p>
        <FunilEtapas linhas={r.funil} total={r.noFunil} gapPara={r.maiorGap?.para ?? null} />
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

/** Filas da Data Crazy, como as abas do CRM: Em aberto, Não iniciados, Aguardando e Com automação. */
function FilasDataCrazy({ filas, admin }: { filas: Filas; admin: boolean }) {
  const listas = [
    { nome: "Em aberto", detalhe: "em atendimento", itens: filas.emAberto },
    { nome: "Não iniciados", detalhe: "ninguém assumiu", itens: filas.naoIniciados },
    { nome: "Aguardando", detalhe: "o lead espera a empresa", itens: filas.aguardando },
    { nome: "Com automação", detalhe: "robô atendendo", itens: filas.comAutomacao },
  ];
  return (
    <section id="filas" className="glass-lite glass-static scroll-mt-28 p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-white">Filas da Data Crazy · {filas.total} conversas abertas</h2>
        <span className="text-[12.5px] tabular-nums text-ink-dim">{listas.map((l) => `${l.nome} ${l.itens.length}`).join(" · ")}</span>
      </div>
      <p className="m-0 mb-3 text-[12px] text-ink-faint">
        Como as abas do CRM: a mesma conversa pode estar em mais de uma (ex.: em atendimento e aguardando). O tempo é real (não só o horário de atendimento): no
        Aguardando, desde a última mensagem do lead; nas outras, desde o início do atendimento atual. Atualiza a cada 15 minutos.{!admin && " Só as suas conversas (as que ninguém assumiu ainda não têm vendedor)."}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {listas.map((f) => (
          <div key={f.nome} className="overflow-x-auto">
            <h3 className="mb-1 text-[13px] font-semibold text-ink">
              {f.nome} · {f.itens.length} <span className="font-normal text-ink-faint">({f.detalhe})</span>
            </h3>
            {f.itens.length === 0 ? (
              <p className="m-0 py-2 text-[13px] italic text-ink-faint">Ninguém nesta fila.</p>
            ) : (
              <table className="w-full border-collapse text-left text-[13px] tabular-nums">
                <thead className="text-[11.5px] text-ink-dim">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Lead</th>
                    <th className="py-1.5 pr-3 font-medium">Vendedor</th>
                    <th className="py-1.5 pr-3 font-medium">Número</th>
                    <th className="py-1.5 pr-3 font-medium">Etapa</th>
                    <th className="py-1.5 text-right font-medium">Na fila há</th>
                  </tr>
                </thead>
                <tbody>
                  {f.itens.slice(0, 100).map((e) => (
                    <tr key={e.conversaId} className="border-t border-line-soft text-ink">
                      <td className="py-1.5 pr-3 text-white">{e.rotulo ?? "—"}</td>
                      <td className="py-1.5 pr-3">{e.vendedor ?? <span className="text-ink-faint">ninguém</span>}</td>
                      <td className="whitespace-nowrap py-1.5 pr-3">{e.numeros.join(" · ") || "—"}</td>
                      <td className="py-1.5 pr-3 text-ink-dim">{e.etapa ?? "—"}</td>
                      <td className="whitespace-nowrap py-1.5 text-right font-semibold text-white">{duracao(e.esperaMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

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
                  <td className="py-1.5 pr-3">{e.vendedor ?? <span className="text-ink-faint">sem vendedor</span>}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{e.numeros.length ? e.numeros.join(" · ") : "—"}</td>
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
