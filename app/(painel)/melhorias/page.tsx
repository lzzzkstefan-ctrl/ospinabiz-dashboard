import { Gaveta } from "@/components/formulario";
import { usuarioLogado } from "@/lib/auth/papeis";
import { listarMelhorias } from "@/modulos/melhorias/dados";
import { diaSP } from "@/modulos/melhorias/regras";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormNovaMelhoria, Quadro } from "./_componentes/quadro";

// Melhorias (só chefe e gerente): backlog em colunas e Novidades (o que foi para "Feito").
// Sugestões de qualquer pessoa chegam pelo botão "Sugerir melhoria" do Início. Contexto em
// docs/modulos/melhorias.md; docs/backlog.md e docs/changelog.md são gerados daqui
// (npm run melhorias:docs).
export default function MelhoriasPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[28px] leading-tight">Melhorias</h1>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

async function Conteudo() {
  const usuario = await usuarioLogado();
  if (usuario?.vendas !== "chefe" && usuario?.vendas !== "gerente") notFound();
  const itens = await listarMelhorias();
  const feitos = itens.filter((m) => m.status === "feito" && m.feitoEm);

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3 border-b border-line-soft pb-2.5">
          <h2 className="text-[19px]">Backlog</h2>
          <p className="m-0 flex-1 text-[12.5px] text-ink-dim">
            Arraste pela alça ⋮⋮ (ou troque o status no cartão). Sugestões da equipe chegam em Ideia. O que vai para Feito entra em Novidades.
          </p>
          <Gaveta rotulo="+ Nova melhoria">
            <FormNovaMelhoria />
          </Gaveta>
        </div>
        <Quadro itens={itens} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Novidades</h2>
        {feitos.length === 0 ? (
          <p className="text-[13px] italic text-ink-faint">Nada entregue ainda.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {feitos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line-soft py-2 text-[13.5px] last:border-b-0">
                <span className="w-24 tabular-nums text-ink-dim">{dataBR(diaSP(m.feitoEm!))}</span>
                <span className="min-w-0 flex-1 text-white">{m.novidade ?? m.titulo}</span>
                {m.aba && <span className="text-[12px] text-ink-faint">{m.aba}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
