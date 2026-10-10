// "Entrei na operação" + quem está online agora (Check-in). Usado na aba Check-in e no Início.
// Em pausa: bolinha amarela "em pausa desde 14:10 (Banho)"; passou do limite: vermelho.

import { BotaoOperacao } from "@/components/botao-operacao";
import { cn } from "@/lib/utils";
import type { Online } from "@/modulos/escala/dados";
import { emBrasilia, NOME_MOTIVO } from "@/modulos/escala/regras";

const horaDe = (iso: string) => {
  const m = emBrasilia(iso).minuto;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const motivoDe = (p: NonNullable<Online["pausa"]>) => (p.detalhe ? `${NOME_MOTIVO[p.motivo]}: ${p.detalhe}` : NOME_MOTIVO[p.motivo]);

/** Botão + quem está online. */
export function PainelOperacao({ eu, agora, pausaLongaMin }: { eu: number | null; agora: Online[]; pausaLongaMin: number }) {
  const meu = agora.find((a) => a.equipeId === eu) ?? null;
  return (
    <section className="glass-lite glass-static grid gap-4 p-4 lg:grid-cols-[1.5fr_1fr]">
      <div>
        {eu === null ? (
          <p className="m-0 text-[13px] text-ink-dim">Seu login ainda não está ligado a ninguém da equipe. Fale com o admin para poder entrar na operação.</p>
        ) : (
          <>
            <p className="m-0 mb-3 text-[12.5px] text-ink-dim">Aperte ao ligar o PC e ao parar de atender. A hora é a do servidor.</p>
            <BotaoOperacao
              online={!!meu}
              desde={meu ? horaDe(meu.desde) : undefined}
              pausa={
                meu?.pausa
                  ? { motivo: motivoDe(meu.pausa), desde: horaDe(meu.pausa.desde), minutos: meu.pausa.minutos, longa: meu.pausa.minutos > pausaLongaMin }
                  : undefined
              }
            />
          </>
        )}
      </div>
      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-white">Online agora · {agora.length}</h2>
        {agora.length === 0 ? (
          <p className="m-0 text-[13px] italic text-[rgb(var(--tag-laranja))]">Ninguém na operação agora.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {agora.map((a) => {
              const longa = !!a.pausa && a.pausa.minutos > pausaLongaMin;
              return (
                <li key={a.checkinId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px]">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      !a.pausa && "bg-[rgb(var(--tag-verde))] shadow-[0_0_8px_rgb(var(--tag-verde)/0.8)]",
                      a.pausa && !longa && "bg-[rgb(var(--tag-amarelo))] shadow-[0_0_8px_rgb(var(--tag-amarelo)/0.8)]",
                      longa && "bg-[rgb(var(--tag-vermelho))] shadow-[0_0_8px_rgb(var(--tag-vermelho)/0.8)]",
                    )}
                    aria-hidden
                  />
                  <span className="text-white">{a.nome}</span>
                  {a.pausa ? (
                    <span className={cn("tabular-nums", longa ? "font-semibold text-[rgb(var(--tag-vermelho))]" : "text-[rgb(var(--tag-amarelo))]")}>
                      em pausa desde {horaDe(a.pausa.desde)} ({motivoDe(a.pausa)}) · {a.pausa.minutos} min{longa ? " · pausa longa" : ""}
                    </span>
                  ) : (
                    <span className="tabular-nums text-ink-dim">online desde {horaDe(a.desde)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
