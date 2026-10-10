import { cn } from "@/lib/utils";
import { usuarioLogado } from "@/lib/auth/papeis";
import { nomeNaEquipe, urlDaCapa } from "@/modulos/inicio/capa";
import { resumirTeste, statusDosNumeros } from "@/modulos/monitor/avaliar-resultado";
import { carregarMonitor } from "@/modulos/monitor/dados";
import { listarTarefas } from "@/modulos/tarefas/dados";
import { hojeSP, lerPeriodo } from "@/modulos/funil/calculo";
import { carregarFunil, configDoFunil, leadsEsperando } from "@/modulos/funil/dados";
import { operacaoAgora } from "@/modulos/escala/dados";
import { PainelOperacao } from "@/components/painel-operacao";
import { contarPorFiltro, hojeEmSaoPaulo } from "@/modulos/tarefas/regras";
import Link from "next/link";
import { Suspense } from "react";
import { Capa } from "./_componentes/capa";

// Página inicial: capa editável e "Status do dia" com o resumo de cada aba.
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
  const admin = usuario?.papel === "admin";
  // Monitor é só de admin: para atendente nem carrega.
  // Funil: o RLS mostra ao vendedor só os leads dele
  const semana = lerPeriodo("7d", undefined, undefined, hojeSP());
  const [capa, nome, monitor, tarefas, funilHoje, funilSemana, esperando, operacao] = await Promise.all([
    urlDaCapa(),
    usuario ? nomeNaEquipe(usuario.id) : Promise.resolve(null),
    admin ? carregarMonitor() : Promise.resolve(null),
    listarTarefas(),
    carregarFunil({ desde: hojeSP(), ate: hojeSP(), vendedorId: null, numeroId: null }),
    carregarFunil({ desde: semana.desde, ate: semana.ate, vendedorId: null, numeroId: null }),
    configDoFunil().then((cfg) => leadsEsperando(cfg)),
    usuario ? operacaoAgora(usuario.id) : Promise.resolve(null),
  ]);

  const agora = new Date();
  const hoje = hojeEmSaoPaulo(agora);
  const dataHoje = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long" }).format(agora);

  const numeros = monitor ? statusDosNumeros(monitor.numeros, monitor.testeAberto, monitor.ultimoFechado, monitor.resultados) : [];
  const resumo = resumirTeste(numeros);
  const bmsComProblema = [...new Set(numeros.filter((n) => n.status === "falhou" || n.status === "sem_resposta").map((n) => n.bm.nome))];
  const contagem = contarPorFiltro(tarefas, hoje);
  const temTeste = monitor?.ultimoFechado != null;

  return (
    <>
      <div className="relative -mt-8 mb-8 pt-[270px] md:-mt-[112px]">
        <Capa url={capa} admin={admin} />
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

      {/* Check-in: o atendente aperta ao ligar o PC */}
      {operacao && (
        <div className="mb-8">
          <PainelOperacao eu={operacao.eu} agora={operacao.agora} pausaLongaMin={operacao.pausaLongaMin} />
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Status do dia</h2>
        <div className={cn("grid gap-4 sm:grid-cols-2", admin && "lg:grid-cols-4")}>
          {admin && (
            <>
              <CardStatus
                href="/monitor"
                rotulo="Números OK no último teste"
                valor={temTeste ? `${resumo.ok}/${resumo.testados}` : "sem teste"}
                detalhe={temTeste ? undefined : `${numeros.length} números em operação`}
                alerta={temTeste && resumo.ok < resumo.testados}
              />
              <CardStatus
                href="/monitor"
                rotulo="BMs com problema"
                valor={temTeste ? String(bmsComProblema.length) : "sem teste"}
                detalhe={bmsComProblema.length > 0 ? bmsComProblema.join(", ") : undefined}
                alerta={bmsComProblema.length > 0}
              />
            </>
          )}
          <CardStatus href="/tarefas" rotulo="Tarefas pendentes" valor={String(contagem.pendentes)} />
          <CardStatus
            href="/tarefas?filtro=atrasadas"
            rotulo="Tarefas atrasadas"
            valor={String(contagem.atrasadas)}
            alerta={contagem.atrasadas > 0}
          />
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Funil</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardStatus href="/funil?p=hoje" rotulo="Leads hoje" valor={String(funilHoje.totalLeads)} />
          <CardStatus
            href="/funil#esperando"
            rotulo="Leads esperando resposta"
            valor={String(esperando.leads.length)}
            detalhe={esperando.leads[0] ? `o mais antigo: ${Math.floor(esperando.leads[0].esperaMs / 3_600_000)}h de atendimento` : undefined}
            alerta={esperando.leads.length > 0}
          />
          <CardStatus
            href="/funil?p=7d"
            rotulo="Maior gap da semana"
            valor={funilSemana.maiorGap ? `−${Math.round(funilSemana.maiorGap.perda * 100)}%` : "—"}
            detalhe={funilSemana.maiorGap ? `${funilSemana.maiorGap.de} → ${funilSemana.maiorGap.para}` : "sem perda entre etapas"}
            alerta={!!funilSemana.maiorGap}
          />
        </div>
      </section>

      {usuario?.papel !== "plantonista" && (
        <section className="mt-8 flex flex-col gap-3">
          <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Vendas</h2>
          <div className="rounded-[18px] border border-dashed border-line px-4 py-6 text-center text-[13.5px] text-ink-faint">
            Vendas · fase 2
          </div>
        </section>
      )}
    </>
  );
}

function CardStatus({
  href,
  rotulo,
  valor,
  detalhe,
  alerta = false,
}: {
  href: string;
  rotulo: string;
  valor: string;
  detalhe?: string;
  alerta?: boolean;
}) {
  return (
    <Link href={href} className={cn("glass-lite flex flex-col gap-1 p-4", alerta && "border-[rgb(var(--tag-vermelho)/0.5)]")}>
      <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">{rotulo}</p>
      <p className={cn("text-[26px] font-semibold tabular-nums", alerta ? "text-[rgb(var(--tag-vermelho))]" : "text-white")}>
        {valor}
      </p>
      {detalhe && <p className="truncate text-[12px] text-ink-dim">{detalhe}</p>}
    </Link>
  );
}
