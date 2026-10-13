"use client";

// Pop-up do feriado (só admin, no layout do painel: aparece em qualquer aba). "Decidir depois" fecha
// até a próxima vez que a dashboard for aberta. Depois da decisão mostra para quem a mensagem de
// WhatsApp saiu (ou o erro).

import { Aviso } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActionState, useState } from "react";
import { decidirFeriado, type ResultadoDecisao } from "../acoes";

export type PerguntaFeriado = { id: number; texto: string };

const SITUACAO: Record<string, string> = {
  ok: "enviada",
  erro: "erro",
  sem_canal: "não enviada: WhatsApp da dashboard ainda não configurado",
  sem_numero: "não enviada: sem WhatsApp cadastrado",
};

/**
 * O layout sempre monta este componente (com ou sem pergunta). Depois da decisão o servidor deixa de
 * mandar a pergunta, mas a última fica guardada aqui para mostrar o resultado dos envios.
 */
export function FeriadoPopup({ pergunta }: { pergunta: PerguntaFeriado | null }) {
  const [ultima, setUltima] = useState(pergunta);
  if (pergunta && pergunta.id !== ultima?.id) setUltima(pergunta);
  return ultima ? <Janela key={ultima.id} pergunta={ultima} /> : null;
}

function Janela({ pergunta }: { pergunta: PerguntaFeriado }) {
  const [aberto, setAberto] = useState(true);
  const [estado, acao, pendente] = useActionState<ResultadoDecisao, FormData>(decidirFeriado, {});
  if (!aberto) return null;
  const decidido = !!estado.ok;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Feriado: a operação vai rodar?" className="w-full max-w-md rounded-2xl border border-line bg-[#0a1418] p-5 shadow-2xl">
        <p className="m-0 mb-1 text-[12px] font-semibold text-[rgb(var(--tag-rosa))]">🎉 Feriado</p>
        <h2 className="m-0 text-[17px] font-semibold leading-snug text-white">{pergunta.texto}</h2>

        {!decidido ? (
          <form action={acao} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="id" value={pergunta.id} />
            <label className="flex flex-col gap-1.5 text-[12.5px] text-ink-dim">
              Mensagem extra para a equipe (opcional)
              <textarea
                name="mensagem_extra"
                maxLength={300}
                rows={2}
                placeholder="Ex.: quem puder, entra 30 min mais cedo"
                className="rounded-xl border border-line bg-transparent px-3 py-2 text-[13.5px] text-white placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="roda" value="sim" disabled={pendente}>
                Vai rodar normal
              </Button>
              <Button type="submit" name="roda" value="nao" variant="outline" disabled={pendente}>
                Não vai rodar
              </Button>
              <button type="button" onClick={() => setAberto(false)} className="ml-auto rounded-full px-3 py-1.5 text-[13px] text-ink-dim hover:bg-bg-raised-2 hover:text-white">
                Decidir depois
              </button>
            </div>
            {pendente && <p className="m-0 text-[12.5px] text-ink-dim">Salvando e mandando as mensagens…</p>}
            <Aviso estado={estado} />
          </form>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <Aviso estado={{ ok: estado.ok }} />
            <div>
              <p className="m-0 mb-1.5 text-[12.5px] font-semibold text-white">Mensagem no WhatsApp</p>
              {estado.envios?.length ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
                  {estado.envios.map((e, i) => (
                    <li key={i} className="flex flex-col">
                      <span className="text-white">
                        {e.nome}
                        {e.numero ? <span className="tabular-nums text-ink-dim"> · {e.numero}</span> : null}
                      </span>
                      <span className={cn(e.situacao === "ok" ? "text-[rgb(var(--tag-verde))]" : "text-[rgb(var(--tag-laranja))]")}>
                        {SITUACAO[e.situacao] ?? e.situacao}
                        {e.situacao === "erro" && e.detalhe ? `: ${e.detalhe}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[12.5px] text-ink-dim">Ninguém tem horário fixo nesse dia: nenhuma mensagem.</p>
              )}
            </div>
            <Button type="button" onClick={() => setAberto(false)} className="self-end">
              Fechar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
