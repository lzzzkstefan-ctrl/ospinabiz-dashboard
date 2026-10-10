import { usuarioLogado } from "@/lib/auth/papeis";
import { hojeSP } from "@/modulos/funil/calculo";
import { configDoFunil, mudancasDoFunil } from "@/modulos/funil/dados";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { apagarMudanca } from "../acoes";
import { FormConfigFunil, FormMudanca } from "../_componentes/formularios";

// Configuração do Funil (só admin): quando um lead conta como "esperando resposta" e o histórico
// de mudanças no funil (as marcas nos gráficos).
export default function ConfigFunilPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/funil" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
          ← Funil
        </Link>
        <h1 className="mt-1 text-[28px] leading-tight">Configuração do Funil</h1>
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
  const supabase = await createClient();
  const [cfg, mudancas, etapas] = await Promise.all([
    configDoFunil(),
    mudancasDoFunil(),
    supabase.from("funil_etapas").select("id, nome, ordem").eq("tipo", "etapa").eq("ativa", true).order("ordem"),
  ]);
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Esperando resposta</h2>
        <p className="text-[12.5px] text-ink-dim">
          O lead aparece em “Esperando resposta” quando a última mensagem é dele e nenhum atendente respondeu (automação não conta) há mais do que estas horas, contando só o
          horário de atendimento, todos os dias.
        </p>
        <FormConfigFunil horas={cfg.horasEspera} inicio={cfg.inicio} fim={cfg.fim} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Mudanças no funil</h2>
        <p className="text-[12.5px] text-ink-dim">Cada mudança vira uma linha tracejada nos gráficos de leads e de conversão, para comparar o antes e o depois.</p>
        <FormMudanca hoje={hojeSP()} etapas={(etapas.data ?? []).map((e) => ({ id: Number(e.id), nome: String(e.nome) }))} />
        {mudancas.length > 0 && (
          <ul className="m-0 flex list-none flex-col p-0">
            {mudancas.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 text-[13.5px] last:border-b-0">
                <span className="w-24 tabular-nums text-ink-dim">{dataBR(m.dia)}</span>
                <span className="text-ink-faint">{m.etapa ?? "funil todo"}</span>
                <span className="flex-1 text-white">{m.descricao}</span>
                <form action={apagarMudanca}>
                  <input type="hidden" name="id" value={m.id} />
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
