import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { hojeSP, lerPeriodo } from "@/modulos/funil/calculo";
import { carregarCustoFluxos, listarMapas, type MapaGuardado } from "@/modulos/funil/custo";
import { custoPorFluxo, nomeComparavel, type CustoDoFluxo } from "@/modulos/funil/custo-fluxos";
import type { TipoBloco } from "@/modulos/funil/mapa-fluxo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { apagarMapa } from "../../acoes";
import { EnviarMapa } from "../../_componentes/enviar-mapa";

// Mapa do funil (custo previsto), só admin. O JSON das automações é lido no navegador
// (modulos/funil/mapa-fluxo.ts) e só a estrutura é guardada. Regras em docs/modulos/funil.md ("Mapa do funil").

export default function MapaFunilPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/funil/custo/fluxos" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
          ← Custo por funil
        </Link>
        <h1 className="mt-1 text-[28px] leading-tight">Mapa do funil</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">
          Suba os JSON exportados das automações da Data Crazy: cada caminho mostra quantas mensagens manda e o custo previsto, comparado com o medido nos últimos 30
          dias. Só a estrutura fica guardada (tipo de bloco, ordem e as primeiras palavras do texto); o arquivo não sai do seu navegador.
        </p>
      </div>
      <section className="glass-lite glass-static p-4">
        <EnviarMapa />
      </section>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const NOME_TIPO: Record<TipoBloco, string> = { texto: "texto", audio: "áudio", video: "vídeo", imagem: "imagem", documento: "documento", outro: "outro" };
const inteiro = (n: number) => n.toLocaleString("pt-BR");
const umaCasa = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

async function Conteudo() {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") notFound();
  const { desde, ate } = lerPeriodo("30d", undefined, undefined, hojeSP());
  const [mapas, medido] = await Promise.all([listarMapas(), carregarCustoFluxos(desde, ate)]);
  const preco = medido.config.preco;
  const moeda = (n: number | null, casas = 2) =>
    n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: medido.config.moeda, minimumFractionDigits: casas, maximumFractionDigits: casas });

  // medido (3B) por nome de automação, para casar com o nome do fluxo exportado
  const porNome = new Map(
    custoPorFluxo(medido.linhas, preco, (id) => medido.compradores.has(id), medido.atendentes)
      .filter((l) => l.tipo === "automacao")
      .map((l) => [nomeComparavel(l.nome), l]),
  );

  if (!mapas.length) return <p className="m-0 text-[13px] italic text-ink-faint">Nenhum fluxo enviado ainda.</p>;
  return (
    <>
      {mapas.map((m) => (
        <CartaoMapa key={m.id} m={m} real={porNome.get(nomeComparavel(m.nome)) ?? null} preco={preco} moeda={moeda} />
      ))}
    </>
  );
}

type Moeda = (n: number | null, casas?: number) => string;

function CartaoMapa({ m, real, preco, moeda }: { m: MapaGuardado; real: CustoDoFluxo | null; preco: number; moeda: Moeda }) {
  const bloco = new Map(m.blocos.map((b) => [b.id, b]));
  const dataEnvio = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(m.enviadoEm));
  return (
    <section className="glass-lite glass-static p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[15px] font-semibold text-white">{m.nome}</h2>
        <div className="flex items-center gap-3 text-[12px] text-ink-faint">
          <span>
            {m.arquivo ?? "sem arquivo"} · enviado em {dataEnvio}
          </span>
          <form action={apagarMapa}>
            <input type="hidden" name="id" value={m.id} />
            <button type="submit" className="text-ink-dim underline-offset-4 hover:underline">
              apagar
            </button>
          </form>
        </div>
      </div>
      <p className="m-0 mt-1 text-[12.5px] text-ink-dim">
        {real ? (
          <>
            Medido nos últimos 30 dias (Custo por funil): <span className="text-white">{umaCasa(real.porLead)} mensagens por lead</span>, {moeda(real.custoPorLead, 3)} por
            lead, {inteiro(real.leads)} leads, {moeda(real.custo)} no total.
          </>
        ) : (
          "Sem mensagens medidas com este nome nos últimos 30 dias (o nome do fluxo no arquivo tem que ser o mesmo da Data Crazy)."
        )}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px] tabular-nums">
          <thead className="text-[11.5px] text-ink-dim">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Caminho</th>
              <th className="py-1.5 pr-3 text-right font-medium">Mensagens</th>
              <th className="py-1.5 pr-3 font-medium">Tipos</th>
              <th className="py-1.5 pr-3 text-right font-medium">Previsto por lead</th>
              <th className="py-1.5 pr-3 text-right font-medium">Medido por lead</th>
              <th className="py-1.5 text-right font-medium">Dá para juntar</th>
            </tr>
          </thead>
          <tbody>
            {m.caminhos.map((c, i) => {
              const tipos = new Map<string, number>();
              for (const id of c.blocos) {
                const t = NOME_TIPO[bloco.get(id)?.tipo ?? "outro"];
                tipos.set(t, (tipos.get(t) ?? 0) + 1);
              }
              const economia = c.juntaveis.reduce((s, g) => s + g.length - 1, 0);
              return (
                <tr key={`${c.nome}-${i}`} className="border-t border-line-soft align-top text-ink">
                  <td className="py-1.5 pr-3">
                    <details>
                      <summary className="cursor-pointer">{c.nome}</summary>
                      <ol className="m-0 mt-2 flex list-decimal flex-col gap-0.5 pl-5 text-[12.5px]">
                        {c.blocos.map((id, j) => {
                          const b = bloco.get(id);
                          const juntavel = c.juntaveis.some((g) => g.includes(id));
                          return (
                            <li key={`${id}-${j}`} className={cn(juntavel && "text-[rgb(var(--tag-laranja))]")}>
                              <span className="text-ink-dim">{NOME_TIPO[b?.tipo ?? "outro"]}</span>
                              {b?.inicio && <span className="ml-2">“{b.inicio}”</span>}
                            </li>
                          );
                        })}
                      </ol>
                    </details>
                  </td>
                  <td className="py-1.5 pr-3 text-right">{c.blocos.length}</td>
                  <td className="py-1.5 pr-3 text-[12px] text-ink-dim">{[...tipos].map(([t, n]) => `${n} ${t}`).join(" · ")}</td>
                  <td className="py-1.5 pr-3 text-right text-white">{moeda(c.blocos.length * preco, 3)}</td>
                  <td className="py-1.5 pr-3 text-right">{real ? moeda((real.porLead ?? 0) * preco, 3) : "—"}</td>
                  <td className={cn("py-1.5 text-right", economia > 0 && "text-[rgb(var(--tag-laranja))]")}>
                    {economia > 0 ? `−${economia} (${moeda(economia * preco, 3)} por lead)` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-2 text-[11.5px] text-ink-faint">
        Previsto = mensagens do caminho × preço (sem descontar a franquia). Em laranja: textos seguidos, sem espera nem pergunta no meio, que podiam ir numa mensagem só.
      </p>
    </section>
  );
}
