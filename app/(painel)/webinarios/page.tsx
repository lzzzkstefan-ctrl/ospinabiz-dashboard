import { Gaveta } from "@/components/formulario";
import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { hojeSP, lerPeriodo } from "@/modulos/funil/calculo";
import { carregarFunil } from "@/modulos/funil/dados";
import { listarWebinarios, webinariosNoAr } from "@/modulos/webinarios/dados";
import { NOME_STATUS } from "@/modulos/webinarios/regras";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";
import { FormCusto, FormWebinario } from "./_componentes/formularios";
import { Checklist, COR_STATUS } from "./_componentes/visual";

// Webinários (v1, sem integração). Admin: cadastro, checklist, sessões, biblioteca e o público
// elegível (vindo do Funil). Vendedor: só checklist e playbook dos webinários "no ar".
// Contexto em docs/modulos/webinarios.md.

type Props = { searchParams: Promise<{ p?: string }> };

export default function WebinariosPage({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight">Webinários</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Downsell para quem não comprou e ascensão para quem comprou.</p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function Conteudo({ searchParams }: Props) {
  const usuario = await usuarioLogado();
  if (!usuario || usuario.papel === "plantonista") return null;
  if (usuario.papel !== "admin") return <VisaoVendedor />;

  const sp = await searchParams;
  const { desde, ate } = lerPeriodo(sp.p === "7d" ? "7d" : "30d", undefined, undefined, hojeSP());
  const supabase = await createClient();
  const [webinarios, funil, config] = await Promise.all([
    listarWebinarios(),
    carregarFunil({ desde, ate, vendedorId: null, numeroId: null }),
    supabase.from("webinarios_config").select("custo_mensagem").maybeSingle(),
  ]);
  const elegiveis = funil.elegiveisPorDia.reduce((s, d) => s + d.qtd, 0);
  const dias = funil.elegiveisPorDia.length;

  return (
    <>
      <section className="glass-lite glass-static overflow-x-auto p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold text-white">Webinários · {webinarios.length}</h2>
          <Gaveta rotulo="+ Novo webinário">
            <FormWebinario />
          </Gaveta>
        </div>
        {webinarios.length === 0 ? (
          <p className="m-0 py-4 text-center text-[13px] italic text-ink-faint">Nenhum webinário cadastrado ainda.</p>
        ) : (
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Webinário</th>
                <th className="py-1.5 pr-3 font-medium">Tipo</th>
                <th className="py-1.5 pr-3 font-medium">Oferta</th>
                <th className="py-1.5 pr-3 text-right font-medium">Preço</th>
                <th className="py-1.5 pr-3 font-medium">Quando</th>
                <th className="py-1.5 pr-3 font-medium">Status</th>
                <th className="py-1.5 text-right font-medium">Checklist</th>
              </tr>
            </thead>
            <tbody>
              {webinarios.map((w) => (
                <tr key={w.id} className="border-t border-line-soft text-ink">
                  <td className="py-1.5 pr-3">
                    <Link href={`/webinarios/${w.id}`} className="text-white underline-offset-4 hover:underline">
                      {w.nome}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 text-ink-dim">{w.tipo === "downsell" ? "Downsell" : "Ascensão"}</td>
                  <td className="py-1.5 pr-3 text-ink-dim">{w.oferta ?? "—"}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right">{w.preco != null ? `R$ ${w.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                  <td className="py-1.5 pr-3 text-ink-dim">{[w.frequencia, w.horario].filter(Boolean).join(", ") || "—"}</td>
                  <td className="py-1.5 pr-3">
                    <Etiqueta cor={COR_STATUS[w.status]}>{NOME_STATUS[w.status]}</Etiqueta>
                  </td>
                  <td className={cn("py-1.5 text-right", w.total && w.feitas === w.total ? "text-[rgb(var(--tag-verde))]" : "text-ink-dim")}>
                    {w.total ? `${w.feitas}/${w.total}` : "sem checklist"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="glass-lite glass-static p-4">
        <div className="mb-1 flex flex-wrap items-baseline gap-3">
          <h2 className="text-[15px] font-semibold text-white">Público elegível para o downsell</h2>
          <nav className="flex gap-1.5 text-[12px]" aria-label="Período">
            {[
              { id: "7d", nome: "7 dias" },
              { id: "30d", nome: "30 dias" },
            ].map((p) => (
              <Link
                key={p.id}
                href={`/webinarios?p=${p.id}`}
                className={cn("rounded-full px-2.5 py-0.5", (sp.p === "7d" ? "7d" : "30d") === p.id ? "bg-accent/15 text-white" : "text-ink-dim hover:text-white")}
              >
                {p.nome}
              </Link>
            ))}
          </nav>
        </div>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">
          Leads que entraram de {dataBR(desde)} a {dataBR(ate)}, não compraram e ficaram com etiqueta de perda ou objeção (vindo do Funil).
        </p>
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div className="flex flex-col gap-1">
            <span className="text-[30px] font-semibold tabular-nums text-white">{elegiveis}</span>
            <span className="text-xs text-ink-dim">leads elegíveis · {dias ? (elegiveis / dias).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0} por dia</span>
          </div>
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <tbody>
              {funil.elegiveisPorMotivo.map((m) => (
                <tr key={m.nome} className="border-t border-line-soft text-ink first:border-t-0">
                  <td className="py-1.5 pr-3">{m.nome}</td>
                  <td className="py-1.5 text-right text-white">{m.qtd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[11.5px] text-ink-faint">Um lead pode ter mais de um motivo; o total conta cada lead uma vez.</p>
      </section>

      <section className="glass-lite glass-static p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-white">Custo de mensagens</h2>
        <FormCusto custo={Number(config.data?.custo_mensagem ?? 0.035)} />
      </section>
    </>
  );
}

/** Vendedor: só os webinários "no ar", com o checklist e o playbook. */
async function VisaoVendedor() {
  const ws = await webinariosNoAr();
  if (!ws.length) return <p className="text-[13.5px] text-ink-dim">Nenhum webinário no ar agora.</p>;
  return (
    <div className="flex flex-col gap-4">
      {ws.map((w) => (
        <section key={w.id} className="glass-lite glass-static p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-white">{w.nome}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Checklist tarefas={w.tarefas} />
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Playbook de objeções</h3>
              {w.playbooks.length ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {w.playbooks.map((p) => (
                    <li key={p.url}>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-accent underline-offset-4 hover:underline">
                        {p.titulo}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[13px] italic text-ink-faint">Sem playbook cadastrado.</p>
              )}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
