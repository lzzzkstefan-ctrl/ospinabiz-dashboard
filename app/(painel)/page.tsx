import { usuarioLogado } from "@/lib/auth/papeis";
import { nomeNaEquipe, urlDaCapa } from "@/modulos/inicio/capa";
import { Suspense } from "react";
import { Capa } from "./_componentes/capa";

// Hoje (central de gestão, 21/11/2026): capa GCS editável e saudação. Só a gestão abre (proxy.ts);
// quem não é da gestão cai em Vendas. Os blocos da operação (Monitor, Tarefas, Funil, Check-in) saíram
// com o arquivamento; prioridades, números, decisões pendentes e prazos chegam na fase 2.
export default function InicioPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <ConteudoInicio />
    </Suspense>
  );
}

const FUSO = "America/Sao_Paulo";

function saudacao(agora: Date): string {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "numeric", hourCycle: "h23" }).format(agora));
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

async function ConteudoInicio() {
  const usuario = await usuarioLogado();
  const [capa, nome] = await Promise.all([urlDaCapa(), usuario ? nomeNaEquipe(usuario.id) : Promise.resolve(null)]);
  const agora = new Date();
  const dataHoje = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long" }).format(agora);

  return (
    <>
      <div className="relative -mt-8 mb-8 pt-[270px] md:-mt-[112px]">
        <Capa url={capa} admin={usuario?.gestao ?? false} />
        <header className="relative z-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink-dim [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
            {dataHoje}
          </p>
          <h1 className="mt-1 text-[28px] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
            {saudacao(agora)}
            {nome ? `, ${nome}` : ""}
          </h1>
        </header>
      </div>

      <section className="max-w-2xl rounded-[18px] border border-dashed border-line px-5 py-6">
        <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-ink-faint">Próxima fase</p>
        <p className="m-0 text-[14px] leading-relaxed text-ink-dim">
          Aqui vão entrar as prioridades da semana, os números de hoje e da semana, o que está esperando decisão do Rodrigo e os prazos dos projetos.
        </p>
      </section>
    </>
  );
}
