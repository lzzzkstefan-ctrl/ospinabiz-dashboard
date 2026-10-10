// "Entrei na operação" + quem está online agora (Check-in). Usado na aba Check-in e no Início.

import { BotaoOperacao } from "@/components/botao-operacao";
import type { Online } from "@/modulos/escala/dados";
import { emBrasilia } from "@/modulos/escala/regras";

const horaDe = (iso: string) => {
  const m = emBrasilia(iso).minuto;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Botão + quem está online. */
export function PainelOperacao({ eu, agora }: { eu: number | null; agora: Online[] }) {
  const meu = agora.find((a) => a.equipeId === eu) ?? null;
  return (
    <section className="glass-lite glass-static grid gap-4 p-4 lg:grid-cols-[1.3fr_1fr]">
      <div>
        {eu === null ? (
          <p className="m-0 text-[13px] text-ink-dim">Seu login ainda não está ligado a ninguém da equipe. Fale com o admin para poder entrar na operação.</p>
        ) : (
          <>
            <p className="m-0 mb-3 text-[12.5px] text-ink-dim">Aperte ao ligar o PC e ao parar de atender. A hora é a do servidor.</p>
            <BotaoOperacao online={!!meu} desde={meu ? horaDe(meu.desde) : undefined} />
          </>
        )}
      </div>
      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-white">Online agora · {agora.length}</h2>
        {agora.length === 0 ? (
          <p className="m-0 text-[13px] italic text-[rgb(var(--tag-laranja))]">Ninguém na operação agora.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {agora.map((a) => (
              <li key={a.checkinId} className="flex items-center gap-2 text-[13.5px]">
                <span className="h-2.5 w-2.5 rounded-full bg-[rgb(var(--tag-verde))] shadow-[0_0_8px_rgb(var(--tag-verde)/0.8)]" aria-hidden />
                <span className="text-white">{a.nome}</span>
                <span className="tabular-nums text-ink-dim">desde {horaDe(a.desde)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
