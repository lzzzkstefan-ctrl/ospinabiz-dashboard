import { Etiqueta } from "@/components/ui/etiqueta";
import { usuarioLogado } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";
import { escalaPadraoVigente } from "@/modulos/escala/dados";
import { horaCurta, NOME_DIA } from "@/modulos/escala/regras";
import { hojeSP } from "@/modulos/funil/calculo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { encerrarPadrao } from "../acoes";
import { FormPadrao, FormPessoa } from "../_componentes/formularios";

// Configuração da Escala (só admin): a escala padrão por dia da semana e as pessoas que cobrem.
// Tirar alguém da escala não apaga o passado: o "escalado" dos dias que já foram continua igual.
export default function ConfigEscalaPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/escala" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
          ← Escala
        </Link>
        <h1 className="mt-1 text-[28px] leading-tight">Escala padrão e pessoas</h1>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

async function Conteudo() {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") notFound();
  const hoje = hojeSP();
  const supabase = await createClient();
  const [padroes, equipe, config] = await Promise.all([
    escalaPadraoVigente(hoje),
    supabase.from("equipe").select("id, nome, usuario_id, ativo").order("nome"),
    supabase.from("funil_config").select("atendimento_inicio, atendimento_fim").maybeSingle(),
  ]);
  const pessoas = (equipe.data ?? []).filter((p) => p.ativo).map((p) => ({ id: Number(p.id), nome: String(p.nome), temLogin: !!p.usuario_id }));
  const operacao = { inicio: String(config.data?.atendimento_inicio ?? "09:00").slice(0, 5), fim: String(config.data?.atendimento_fim ?? "22:00").slice(0, 5) };

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Escala padrão</h2>
        <p className="text-[12.5px] text-ink-dim">
          Quem cobre cada dia da semana. Ex.: domingo a sexta com os vendedores; sábado sem escala fixa (fica &quot;descoberto&quot; até alguém marcar plantão). Para
          passar a segunda a segunda, é só adicionar o sábado aqui.
        </p>
        <FormPadrao pessoas={pessoas} operacao={operacao} hoje={hoje} />
        <div className="mt-2 grid gap-2 md:grid-cols-7">
          {NOME_DIA.map((nome, i) => {
            const doDia = padroes.filter((p) => p.dia_semana === i);
            return (
              <div key={nome} className={`rounded-xl border p-2.5 ${doDia.length ? "border-line-soft" : "border-[rgb(var(--tag-vermelho)/0.6)]"}`}>
                <p className="m-0 mb-1.5 text-[13px] font-semibold text-white">{nome}</p>
                {doDia.length === 0 && <p className="m-0 text-[12px] text-[rgb(var(--tag-vermelho))]">ninguém fixo</p>}
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px]">
                  {doDia.map((p) => (
                    <li key={p.id} className="flex flex-col">
                      <span className="text-white">{p.nome}</span>
                      <span className="tabular-nums text-ink-dim">
                        {horaCurta(p.inicio)}–{horaCurta(p.fim)}
                        {p.tipo === "raspagem" && <span className="text-[rgb(var(--tag-roxo))]"> · raspagem</span>}
                      </span>
                      {p.desde > hoje && <span className="text-[11.5px] text-ink-faint">a partir de {dataBR(p.desde)}</span>}
                      {p.ate && <span className="text-[11.5px] text-ink-faint">até {dataBR(p.ate)}</span>}
                      <form action={encerrarPadrao}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="text-[11.5px] text-ink-faint underline-offset-4 hover:text-ink hover:underline">
                          tirar da escala
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Pessoas que cobrem</h2>
        <p className="text-[12.5px] text-ink-dim">
          Quem pode entrar na escala (vendedores, seus irmãos, alguém só para sábado). Para fazer check-in e ver os leads no Funil, a pessoa precisa de login: o convite de
          plantonista é feito pelo admin (link pelo WhatsApp).
        </p>
        <FormPessoa />
        <ul className="m-0 flex list-none flex-col p-0">
          {pessoas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 text-[13.5px] last:border-b-0">
              <span className="flex-1 text-white">{p.nome}</span>
              {p.temLogin ? <Etiqueta cor="verde">tem login</Etiqueta> : <Etiqueta cor="cinza">sem login (não faz check-in)</Etiqueta>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
