import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { duracao, hojeSP, lerPeriodo, minimoParaGap, type Periodo } from "@/modulos/funil/calculo";
import { carregarFunil, opcoesDoFunil, statusDaSincronizacao, type StatusSincronizacao } from "@/modulos/funil/dados";
import Link from "next/link";
import { Suspense } from "react";
import { BarrasPorDia, FunilEtapas } from "./_componentes/graficos";

// Funil e Leads (v1). Contexto e regras em docs/modulos/funil.md; cálculo em modulos/funil/calculo.ts.
// Admin vê tudo e filtra por vendedor/número; o vendedor vê só o funil dele (garantido pelo RLS).

type Busca = { p?: string; de?: string; ate?: string; v?: string; n?: string };
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

  const [r, sync] = await Promise.all([carregarFunil({ desde, ate, vendedorId, numeroId }), statusDaSincronizacao()]);

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

  const compradores = r.compradores.hubla + r.compradores.foraHubla;

  return (
    <>
      <AvisoSincronizacao sync={sync} />

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

      {/* números principais */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Leads no período" valor={String(r.totalLeads)} detalhe={r.foraDoFunil ? `${r.foraDoFunil} fora do funil (suporte, menor, lançamento)` : undefined} />
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

      <section className="glass-lite glass-static p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-white">Leads por dia</h2>
        <BarrasPorDia dias={r.porDia} />
      </section>

      <section className="glass-lite glass-static overflow-x-auto p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Funil por etapa</h2>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">
          Leads que entraram no período e chegaram em cada etapa (quem chegou numa etapa conta nas anteriores). Perda = quanto caiu em relação à
          etapa de cima. Maior gap: só entre etapas com pelo menos {minimoParaGap(r.noFunil)} leads na de cima.
        </p>
        <FunilEtapas linhas={r.funil} total={r.noFunil} gapPara={r.maiorGap?.para ?? null} />
      </section>

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
