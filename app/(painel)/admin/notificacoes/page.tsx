import { usuarioLogado } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";
import { carregarDiagnostico } from "@/modulos/escala/diagnostico-push";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

// Diagnóstico das notificações (só admin): em que aparelho e em que dia o aviso parou de chegar.
// Contexto em docs/modulos/escala.md ("Confirmação de recebimento").

export default function NotificacoesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/escala" className="text-[13px] text-ink-dim underline-offset-4 hover:underline">
          ← Check-in
        </Link>
        <h1 className="mt-1 text-[28px] leading-tight">Diagnóstico das notificações</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">Últimos 14 dias. Aceito = Apple ou Google pegaram o aviso. Recebido = o próprio aparelho mostrou e confirmou.</p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const quando = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const atraso = (ms: number | null) => (ms === null ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}min`);

async function Conteudo() {
  const usuario = await usuarioLogado();
  if (usuario?.papel !== "admin") notFound();
  const d = await carregarDiagnostico();

  return (
    <>
      <section className="glass-lite glass-static overflow-x-auto p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Por pessoa e aparelho</h2>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">
          Não confirmados contam a partir do 1º recibo do aparelho e só depois de 1 hora do envio. &quot;Nunca confirmou&quot; = ainda está com o service worker antigo (falta abrir o app) ou o aviso não está chegando.
        </p>
        {d.aparelhos.length === 0 ? (
          <p className="m-0 py-2 text-[13px] italic text-ink-faint">Nenhum aparelho ativado.</p>
        ) : (
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Pessoa</th>
                <th className="py-1.5 pr-3 font-medium">Aparelho</th>
                <th className="py-1.5 pr-3 text-right font-medium">Enviados</th>
                <th className="py-1.5 pr-3 text-right font-medium">Aceitos</th>
                <th className="py-1.5 pr-3 text-right font-medium">Recebidos</th>
                <th className="py-1.5 pr-3 text-right font-medium">Não confirmados</th>
                <th className="py-1.5 pr-3 font-medium">Último recebido</th>
                <th className="py-1.5 pr-3 text-right font-medium">Atraso típico</th>
                <th className="py-1.5 pr-3 font-medium">App aberto</th>
                <th className="py-1.5 text-right font-medium">Versão</th>
              </tr>
            </thead>
            <tbody>
              {d.aparelhos.map((a) => (
                <tr key={a.chave} className={cn("border-t border-line-soft text-ink", !a.inscrito && "text-ink-faint")}>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-white">{a.pessoa}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    {a.aparelho}
                    {!a.inscrito && <span className="text-[11.5px]"> · removido</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{a.enviados}</td>
                  <td className="py-1.5 pr-3 text-right">{a.aceitos}</td>
                  <td className="py-1.5 pr-3 text-right text-white">{a.recebidos}</td>
                  <td className={cn("whitespace-nowrap py-1.5 pr-3 text-right", (a.perdidos > 0 || (a.nuncaConfirmou && a.aceitos > 0)) && "font-semibold text-[rgb(var(--tag-laranja))]")}>
                    {a.nuncaConfirmou ? (a.aceitos > 0 ? "nunca confirmou" : "—") : a.perdidos}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{quando(a.ultimoRecebido)}</td>
                  <td className="py-1.5 pr-3 text-right">{atraso(a.atrasoMedianoMs)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-ink-dim">{quando(a.appVistoEm)}</td>
                  <td className="py-1.5 text-right text-ink-dim">{a.swVersao ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="glass-lite glass-static overflow-x-auto p-4">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Por dia</h2>
        <p className="m-0 mb-3 text-[12px] text-ink-faint">Recebidos / aceitos em cada dia. Laranja = faltou confirmar algum aviso daquele dia.</p>
        {d.dias.length === 0 ? (
          <p className="m-0 py-2 text-[13px] italic text-ink-faint">Nenhum aviso enviado desde que a medição começou.</p>
        ) : (
          <table className="w-full border-collapse text-left text-[12.5px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Aparelho</th>
                {d.dias.map((dia) => (
                  <th key={dia} className="py-1.5 pr-3 text-right font-medium">
                    {diaCurto(dia)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.aparelhos.map((a) => (
                <tr key={a.chave} className="border-t border-line-soft text-ink">
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    <span className="text-white">{a.pessoa}</span> · {a.aparelho}
                  </td>
                  {d.dias.map((dia) => {
                    const c = a.porDia.get(dia);
                    return (
                      <td key={dia} className={cn("whitespace-nowrap py-1.5 pr-3 text-right", c && c.recebidos < c.aceitos && "font-semibold text-[rgb(var(--tag-laranja))]")}>
                        {c ? `${c.recebidos}/${c.aceitos}` : <span className="text-ink-faint">·</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="glass-lite glass-static overflow-x-auto p-4">
        <h2 className="mb-3 text-[15px] font-semibold text-white">Avisos não confirmados · {d.naoConfirmados.length}</h2>
        {d.naoConfirmados.length === 0 ? (
          <p className="m-0 py-2 text-[13px] italic text-ink-faint">Nenhum até agora.</p>
        ) : (
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead className="text-[11.5px] text-ink-dim">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Enviado</th>
                <th className="py-1.5 pr-3 font-medium">Pessoa</th>
                <th className="py-1.5 pr-3 font-medium">Aparelho</th>
                <th className="py-1.5 font-medium">Aviso</th>
              </tr>
            </thead>
            <tbody>
              {d.naoConfirmados.map((n) => (
                <tr key={n.id} className="border-t border-line-soft text-ink">
                  <td className="whitespace-nowrap py-1.5 pr-3">{quando(n.quando)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-white">{n.pessoa}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{n.aparelho}</td>
                  <td className="py-1.5 text-ink-dim">{n.aviso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
