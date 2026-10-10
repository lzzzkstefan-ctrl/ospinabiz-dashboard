import { Gaveta } from "@/components/formulario";
import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { hojeSP } from "@/modulos/funil/calculo";
import { carregarWebinario } from "@/modulos/webinarios/dados";
import { custoMensagens, funilDaSessao, NOME_STATUS, NOME_TIPO, porVariacao, somar, type Sessao } from "@/modulos/webinarios/regras";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { apagarLink, apagarSessao } from "../acoes";
import { FormChecklist, FormLink, FormSessao, FormWebinario } from "../_componentes/formularios";
import { Checklist, COR_STATUS } from "../_componentes/visual";

// Um webinário (só admin): cadastro, checklist (tarefas), sessões com funil e A/B, custo de
// mensagens e biblioteca de links.
type Props = { params: Promise<{ id: string }> };

export default function WebinarioPage({ params }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/webinarios" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
        ← Webinários
      </Link>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const reais = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const n = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR"));

async function Conteudo({ params }: Props) {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") notFound();
  const { id } = await params;
  const dados = /^\d+$/.test(id) ? await carregarWebinario(Number(id)) : null;
  if (!dados) notFound();
  const { webinario: w, sessoes, links, tarefas, modelo, equipe, custoMensagem } = dados;
  const faltam = modelo.filter((m) => m.ativo && !tarefas.some((t) => t.titulo === m.titulo)).length;
  const total = somar(sessoes);
  const custoTotal = custoMensagens(total, custoMensagem);
  const variacoes = porVariacao(sessoes);

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] leading-tight">{w.nome}</h1>
        <Etiqueta cor={COR_STATUS[w.status]}>{NOME_STATUS[w.status]}</Etiqueta>
        <span className="text-[13px] text-ink-dim">{NOME_TIPO[w.tipo]}</span>
      </header>
      <p className="-mt-3 text-[13px] text-ink-dim">
        {[w.oferta, w.preco != null && reais(Math.round(w.preco * 100)), w.frequencia, w.horario].filter(Boolean).join(" · ") || "Sem oferta e horário ainda."}
        {" · "}plataforma: {w.plataforma ?? "a definir"} · oferta na Hubla: {w.hubla_oferta_id ?? "a definir"}
      </p>

      <section className="glass-lite glass-static p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold text-white">Cadastro</h2>
          <Gaveta rotulo="Editar">
            <FormWebinario webinario={w} />
          </Gaveta>
        </div>
      </section>

      <section className="glass-lite glass-static p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-white">Checklist de implantação</h2>
        <Checklist tarefas={tarefas} />
        {faltam > 0 && (
          <div className="mt-4 border-t border-line-soft pt-3">
            <p className="m-0 mb-2 text-[12px] text-ink-faint">Cria cada item do modelo como tarefa na aba Tarefas, ligada a este webinário. Depois dá para trocar o responsável e o prazo de cada uma lá.</p>
            <FormChecklist webinarioId={w.id} equipe={equipe} faltam={faltam} />
          </div>
        )}
      </section>

      <section className="glass-lite glass-static overflow-x-auto p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold text-white">Sessões · {sessoes.length}</h2>
          <Gaveta rotulo="+ Registrar sessão">
            <FormSessao webinarioId={w.id} hoje={hojeSP()} />
          </Gaveta>
        </div>
        {sessoes.length === 0 ? (
          <p className="m-0 py-4 text-center text-[13px] italic text-ink-faint">Nenhuma sessão registrada.</p>
        ) : (
          <>
            <h3 className="mb-2 text-[13px] font-semibold text-ink">Funil (todas as sessões somadas)</h3>
            <FunilTabela linhas={funilDaSessao(total)} />
            <p className="m-0 mt-2 text-[12.5px] text-ink-dim">
              Recuperados: {n(total.recuperados_quente)} quente · {n(total.recuperados_morno)} morno
            </p>

            {variacoes.length > 1 && (
              <>
                <h3 className="mb-2 mt-5 text-[13px] font-semibold text-ink">Teste A/B (por variação)</h3>
                <table className="w-full border-collapse text-left text-[13px] tabular-nums">
                  <thead className="text-[11.5px] text-ink-dim">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Variação</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Sessões</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Convidados</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Compraram</th>
                      <th className="py-1.5 text-right font-medium">Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variacoes.map((v) => (
                      <tr key={v.variacao} className="border-t border-line-soft text-ink">
                        <td className="py-1.5 pr-3">{v.variacao}</td>
                        <td className="py-1.5 pr-3 text-right">{v.sessoes}</td>
                        <td className="py-1.5 pr-3 text-right">{n(v.convidados)}</td>
                        <td className="py-1.5 pr-3 text-right">{n(v.compraram)}</td>
                        <td className="py-1.5 text-right text-white">{pct(v.conversao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <h3 className="mb-2 mt-5 text-[13px] font-semibold text-ink">Por sessão</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {sessoes.map((s) => (
                <LinhaSessao key={s.id} sessao={s} custoMensagem={custoMensagem} webinarioId={w.id} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="glass-lite glass-static p-4">
        <h2 className="mb-2 text-[15px] font-semibold text-white">Custo de mensagens (estimado)</h2>
        <p className="m-0 text-[13px] text-ink">
          {custoTotal.template.toLocaleString("pt-BR")} por template × R$ {String(custoMensagem).replace(".", ",")} = <strong className="text-white">{reais(custoTotal.custoCentavos)}</strong>
          <span className="text-ink-dim"> · {custoTotal.janela.toLocaleString("pt-BR")} dentro da janela de 24h (grátis)</span>
        </p>
        <p className="m-0 mt-1 text-[11.5px] text-ink-faint">Mensagens digitadas por sessão. O custo por mensagem muda na página de Webinários.</p>
      </section>

      <section className="glass-lite glass-static p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold text-white">Biblioteca · {links.length}</h2>
          <Gaveta rotulo="+ Adicionar link">
            <FormLink webinarioId={w.id} />
          </Gaveta>
        </div>
        {links.length === 0 ? (
          <p className="m-0 text-[13px] italic text-ink-faint">Nenhum link ainda (roteiro, copy, script, criativo, playbook).</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-1.5 text-[13px] last:border-b-0">
                <span className="w-20 text-ink-faint">{l.tipo}</span>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-accent underline-offset-4 hover:underline">
                  {l.titulo}
                </a>
                <form action={apagarLink}>
                  <input type="hidden" name="id" value={l.id} />
                  <button type="submit" className="text-[12px] text-ink-dim underline-offset-4 hover:underline">
                    apagar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function FunilTabela({ linhas }: { linhas: ReturnType<typeof funilDaSessao> }) {
  const max = Math.max(1, ...linhas.map((l) => l.qtd ?? 0));
  return (
    <table className="w-full border-collapse text-left text-[13px] tabular-nums">
      <thead className="text-[11.5px] text-ink-dim">
        <tr>
          <th className="py-1.5 pr-3 font-medium">Etapa</th>
          <th className="w-[40%] py-1.5 pr-3 font-medium">
            <span className="sr-only">Barra</span>
          </th>
          <th className="py-1.5 pr-3 text-right font-medium">Pessoas</th>
          <th className="py-1.5 pr-3 text-right font-medium">da etapa de cima</th>
          <th className="py-1.5 text-right font-medium">dos convidados</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.nome} className="border-t border-line-soft text-ink">
            <td className="whitespace-nowrap py-1.5 pr-3">{l.nome}</td>
            <td className="py-1.5 pr-3">
              <div className="h-2.5 w-full">
                <div className="h-full rounded-r-[4px] bg-accent" style={{ width: l.qtd ? `${Math.max(1.5, (l.qtd / max) * 100)}%` : 0 }} />
              </div>
            </td>
            <td className="py-1.5 pr-3 text-right text-white">{n(l.qtd)}</td>
            <td className="py-1.5 pr-3 text-right text-ink-dim">{pct(l.doAnterior)}</td>
            <td className="py-1.5 text-right text-ink-dim">{pct(l.doTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LinhaSessao({ sessao: s, custoMensagem, webinarioId }: { sessao: Sessao; custoMensagem: number; webinarioId: number }) {
  const f = funilDaSessao(s);
  const custo = custoMensagens(s, custoMensagem);
  const conv = s.convidados && s.compraram != null ? s.compraram / s.convidados : null;
  return (
    <li className="rounded-xl border border-line-soft px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span className="font-semibold text-white">{dataBR(s.dia)}</span>
        {s.variacao && <Etiqueta cor="roxo">{s.variacao}</Etiqueta>}
        <span className="tabular-nums text-ink-dim">{f.map((l) => n(l.qtd)).join(" → ")}</span>
        <span className={cn("tabular-nums", conv ? "text-white" : "text-ink-faint")}>conversão {pct(conv)}</span>
        <span className="tabular-nums text-ink-dim">mensagens {reais(custo.custoCentavos)}</span>
        <span className="ml-auto flex items-center gap-2">
          <Gaveta rotulo="editar">
            <FormSessao webinarioId={webinarioId} sessao={s} hoje={s.dia} />
          </Gaveta>
          <form action={apagarSessao}>
            <input type="hidden" name="id" value={s.id} />
            <button type="submit" className="text-[12px] text-ink-dim underline-offset-4 hover:underline">
              apagar
            </button>
          </form>
        </span>
      </div>
      {s.observacoes && <p className="m-0 mt-1 text-[12px] text-ink-faint">{s.observacoes}</p>}
    </li>
  );
}
