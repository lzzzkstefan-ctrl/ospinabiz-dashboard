import { Etiqueta, type CorEtiqueta } from "@/components/ui/etiqueta";
import { metaConfigurada } from "@/lib/integracoes/meta";
import { podeSerTestado, resumirTeste, statusDosNumeros } from "@/modulos/monitor/avaliar-resultado";
import { carregarMonitor } from "@/modulos/monitor/dados";
import type { NumeroComStatus, StatusNaTela } from "@/modulos/monitor/tipos";
import { Suspense } from "react";
import { BotaoRodarTeste } from "./_componentes/botao-rodar-teste";

// Monitor dos números de WhatsApp: um card por BM, só números em operação.
// Regras do resultado em modulos/monitor/avaliar-resultado.ts.
export default function MonitorPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight">Monitor de números</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">
          Teste automático às 7h30 e às 17h (horário de Brasília) nos números em operação.
        </p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <ConteudoMonitor />
      </Suspense>
    </div>
  );
}

const STATUS: Record<StatusNaTela, { texto: string; cor: CorEtiqueta }> = {
  ok: { texto: "OK", cor: "verde" },
  falhou: { texto: "falhou", cor: "vermelho" },
  sem_resposta: { texto: "sem resposta", cor: "laranja" },
  em_teste: { texto: "em teste", cor: "azul" },
  sem_teste: { texto: "sem teste", cor: "cinza" },
};

/** "2026-10-08T10:30:00Z" -> "08/10 07:30" (horário de Brasília). */
function dataHora(iso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  return partes.replace(",", "");
}

async function ConteudoMonitor() {
  const dados = await carregarMonitor();
  const numeros = statusDosNumeros(dados.numeros, dados.testeAberto, dados.ultimoFechado, dados.resultados);
  const resumo = resumirTeste(numeros);
  const prontos = numeros.filter(podeSerTestado).length;

  const porBm = new Map<number, NumeroComStatus[]>();
  for (const n of numeros) porBm.set(n.bm.id, [...(porBm.get(n.bm.id) ?? []), n]);
  const grupos = [...porBm.values()]
    .map((lista) => lista.sort((a, b) => a.final.localeCompare(b.final)))
    .sort((a, b) => a[0].bm.nome.localeCompare(b[0].bm.nome, "pt-BR"));

  return (
    <>
      <section className="glass glass-destaque flex flex-col gap-4 p-5">
        {dados.ultimoFechado ? (
          <div>
            <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">
              Último teste · {dataHora(dados.ultimoFechado.iniciado_em)}
            </p>
            <p className="mt-1 text-[30px] font-semibold tabular-nums text-white">
              {resumo.ok}/{resumo.testados} ok
            </p>
            {resumo.problemas.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-[13.5px] text-white">
                {resumo.problemas.map((p) => (
                  <li key={p}>❌ {p}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">Último teste</p>
            <p className="mt-1 text-[24px] font-semibold text-white">Nenhum teste ainda</p>
          </div>
        )}
        <p className="text-[13px] text-ink-dim">
          <span className="font-semibold text-white">{numeros.length}</span> números em operação ·{" "}
          <span className="font-semibold text-white">{prontos}</span> com telefone completo (prontos para o teste)
          {dados.testeAberto && <> · teste em andamento desde {dataHora(dados.testeAberto.iniciado_em)}</>}
        </p>
        <BotaoRodarTeste habilitado={metaConfigurada() && prontos > 0} />
      </section>

      {grupos.length === 0 ? (
        <p className="text-[13.5px] text-ink-faint">Nenhum número em operação. Cadastre na aba BMs.</p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {grupos.map((lista) => (
            <CardBm key={lista[0].bm.id} numeros={lista} />
          ))}
        </div>
      )}
    </>
  );
}

function CardBm({ numeros }: { numeros: NumeroComStatus[] }) {
  const ok = numeros.filter((n) => n.status === "ok").length;
  const testados = numeros.filter((n) => n.status !== "sem_teste" && n.status !== "em_teste").length;

  return (
    <div className="glass-lite glass-static flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 border-b border-line-soft pb-2.5">
        <h2 className="truncate text-[17px]">{numeros[0].bm.nome}</h2>
        <span className="ml-auto shrink-0 text-[12px] tabular-nums text-ink-faint">
          {testados > 0 ? `${ok}/${testados} ok` : `${numeros.length} ${numeros.length === 1 ? "número" : "números"}`}
        </span>
      </div>
      <ul className="flex flex-col">
        {numeros.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-2 border-b border-line-soft py-2 last:border-b-0">
            <span className="w-12 text-[15px] font-semibold tabular-nums text-white">{n.final}</span>
            <Etiqueta cor={STATUS[n.status].cor}>{STATUS[n.status].texto}</Etiqueta>
            {!podeSerTestado(n) && <Etiqueta cor="laranja">falta telefone</Etiqueta>}
            {n.testadoEm && <span className="ml-auto text-[12px] tabular-nums text-ink-faint">{dataHora(n.testadoEm)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
