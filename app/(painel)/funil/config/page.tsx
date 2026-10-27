import { usuarioLogado } from "@/lib/auth/papeis";
import { hojeSP } from "@/modulos/funil/calculo";
import { configDoCusto } from "@/modulos/funil/custo";
import { configDoFunil, mudancasDoFunil } from "@/modulos/funil/dados";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { apagarMudanca, apagarNumeroInterno } from "../acoes";
import { FormConfigFunil, FormCustoMensagens, FormEtiquetaChegada, FormMudanca, FormNumeroInterno } from "../_componentes/formularios";

// Configuração do Funil (só admin): quando um lead conta como "esperando resposta", o histórico
// de mudanças no funil (as marcas nos gráficos) e os números internos (teste), que ficam fora.
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
  const [cfg, mudancas, etapas, internos, etiquetas, chegada, custo] = await Promise.all([
    configDoFunil(),
    mudancasDoFunil(),
    supabase.from("funil_etapas").select("id, nome, ordem").eq("tipo", "etapa").eq("ativa", true).order("ordem"),
    // só o final do telefone vai para a tela
    supabase.from("funil_numeros_internos").select("id, nome, chave, criado_em").order("criado_em"),
    supabase.from("funil_etiquetas").select("dc_id, nome").eq("existe", true).order("nome"),
    supabase.from("funil_config").select("etiqueta_chegada_dc_id, etiqueta_chegada_desde").maybeSingle(),
    configDoCusto(),
  ]);
  // "desde" na tela em horário de Brasília (AAAA-MM-DDTHH:MM)
  const desdeSP = chegada.data?.etiqueta_chegada_desde
    ? new Date(Date.parse(String(chegada.data.etiqueta_chegada_desde)) - 3 * 3_600_000).toISOString().slice(0, 16)
    : "";
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Esperando resposta</h2>
        <p className="text-[12.5px] text-ink-dim">
          O lead aparece em “Esperando resposta” quando a última mensagem é dele e nenhuma mensagem da empresa veio depois (atendente ou automação) há mais do que estas
          horas, e em “Aguardando o lead” quando a última é da empresa e ele não responde há mais do que estas horas. Conta só o horário de atendimento, todos os dias.
          Em “Leads sem atendimento na chegada”, quem chega dentro do horário e não tem resposta de atendente em até os minutos abaixo conta como sem atendente.
        </p>
        <FormConfigFunil horas={cfg.horasEspera} inicio={cfg.inicio} fim={cfg.fim} minutos={cfg.minutosResposta} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Etiqueta de chegada (CL)</h2>
        <p className="text-[12.5px] text-ink-dim">
          Etiqueta que a automação “Contador de lead” põe quando chega a mensagem do anúncio. Ela marca a chegada, não é etapa: a chegada do lead é o que vier primeiro
          entre a 1ª mensagem e esta etiqueta. A etiqueta é reconhecida pelo id, então renomear na Data Crazy não muda nada. Só contam as colocações a partir do horário
          abaixo (a etiqueta foi reaproveitada de outra).
        </p>
        <FormEtiquetaChegada
          etiquetas={(etiquetas.data ?? []).map((e) => ({ id: String(e.dc_id), nome: String(e.nome) }))}
          atual={chegada.data?.etiqueta_chegada_dc_id ? String(chegada.data.etiqueta_chegada_dc_id) : null}
          desde={desdeSP}
        />
      </section>

      <section id="custo" className="flex scroll-mt-28 flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Custo de mensagens</h2>
        <p className="text-[12.5px] text-ink-dim">
          A Meta cobra cada mensagem enviada e entregue. As primeiras mensagens de cada número no mês (franquia) saem de graça; depois, todas são cobradas. Lead que chega
          por anúncio Click-to-WhatsApp tem uma janela grátis (se a resposta sair em até 24 h); lead de link não tem. Mudar estes valores recalcula o custo do mês.{" "}
          <Link href="/funil/custo" className="underline-offset-4 hover:underline">
            Ver o custo
          </Link>
        </p>
        <FormCustoMensagens preco={custo.preco} franquia={custo.franquia} moeda={custo.moeda} janela={custo.janelaGratisHoras} />
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

      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">Números internos (teste)</h2>
        <p className="text-[12.5px] text-ink-dim">
          Números da equipe usados para testar. Ficam fora de toda a dashboard do Funil: leads por dia, funil, conversão, esperando resposta, aguardando o lead, filas e
          tempo de primeira resposta. A comparação é pelos 8 últimos dígitos, então tanto faz digitar com +55, DDD ou o 9 extra. O que já foi contado com o número sai
          da contagem depois da sincronização.
        </p>
        <FormNumeroInterno />
        {(internos.data ?? []).length > 0 && (
          <ul className="m-0 flex list-none flex-col p-0">
            {(internos.data ?? []).map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft py-2 text-[13.5px] last:border-b-0">
                <span className="flex-1 text-white">{n.nome}</span>
                <span className="tabular-nums text-ink-dim">final {String(n.chave).slice(-4)}</span>
                <form action={apagarNumeroInterno}>
                  <input type="hidden" name="id" value={n.id} />
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
