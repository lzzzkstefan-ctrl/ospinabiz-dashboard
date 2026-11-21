import { Etiqueta, type CorEtiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { carregarFrentes, proximosPassos, vendasDoMesPorLinha } from "@/modulos/gestao/dados";
import { COLUNAS, hojeSP, STATUS_FRENTE, textoPrazo } from "@/modulos/gestao/regras";
import { ArrowRight, Workflow } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DadosFrente, Influencers, Notas, Ofertas, Titulo } from "../_componentes/frente";

// Página de uma frente (fase 3): estratégia e meta, oferta e escada, funil ligado, próximos passos (de
// Projetos), influencers (na frente do Viral ou quando houver) e notas. Só a gestão.
type Props = { params: Promise<{ slug: string }> };

export default function FrentePage({ params }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/frentes" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
        ← Frentes
      </Link>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando…</p>}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario?.gestao) notFound();
  const { slug } = await params;
  const hoje = hojeSP();
  const [frentes, mes] = await Promise.all([carregarFrentes(), vendasDoMesPorLinha(hoje)]);
  const f = frentes.find((x) => x.slug === slug);
  if (!f) notFound();
  const passos = await proximosPassos(f.id);
  const st = STATUS_FRENTE[f.status];
  const mostrarInfluencers = f.slug === "viral-influencers" || f.influencers.length > 0;

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] leading-tight">{f.nome}</h1>
        <Etiqueta cor={st.cor as CorEtiqueta}>{st.nome}</Etiqueta>
        {f.mapa && (
          <Link href={`/funis?m=${f.mapa.slug}`} className="ml-auto flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:border-accent/60 hover:text-white">
            <Workflow size={14} aria-hidden /> Ver o funil
          </Link>
        )}
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          <DadosFrente f={f} real={f.linha_vendas ? mes[f.linha_vendas] : null} />
          <Ofertas frenteId={f.id} ofertas={f.ofertas} />
          {mostrarInfluencers && <Influencers frenteId={f.id} lista={f.influencers} />}
        </div>
        <div className="flex min-w-0 flex-col gap-10">
          <section>
            <Titulo
              acao={
                <Link href="/projetos" className="flex items-center gap-1 text-[12.5px] text-ink-dim transition-colors hover:text-white">
                  Projetos <ArrowRight size={13} aria-hidden />
                </Link>
              }
            >
              Próximos passos
            </Titulo>
            {passos.length === 0 ? (
              <p className="m-0 border-y border-line-soft py-3 text-[13px] text-ink-faint">Nenhum projeto aberto nesta frente.</p>
            ) : (
              <ul className="divide-y divide-line-soft border-y border-line-soft">
                {passos.map((p) => {
                  const col = COLUNAS.find((c) => c.id === p.coluna)!;
                  return (
                    <li key={p.id}>
                      <Link href={`/projetos?i=${p.id}`} className="flex items-center gap-3 py-2.5 text-[13.5px] transition-colors hover:text-white">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: `rgb(var(--tag-${col.cor}))` }} title={col.nome} />
                        <span className="min-w-0 flex-1 text-ink">{p.titulo}</span>
                        {p.total > 0 && <span className="shrink-0 text-[12px] tabular-nums text-ink-faint">{p.feitos}/{p.total}</span>}
                        {p.prazo && <span className="shrink-0 text-[12px] text-ink-dim">{textoPrazo(p.prazo, hoje)}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <Notas f={f} />
        </div>
      </div>
    </>
  );
}
