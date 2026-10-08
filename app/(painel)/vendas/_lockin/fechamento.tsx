"use client";

// Fechamento do mês de UM vendedor (igual ao do Lock in): comissão, adiantamentos,
// a receber, mensagem pro Rodrigo, observações e link público.
// Admin edita tudo; o vendedor só vê os números, as observações e a prévia.

import {
  criarAdiantamento,
  desativarLinkMes,
  gerarLinkMes,
  registrarFechamento,
  removerAdiantamento,
  salvarObservacoes,
  salvarWhatsapp,
} from "../acoes-lockin";
import { mesCapitalizado, textoFechamento, valorFinalDe, type ResumoLI } from "@/modulos/vendas/lock-in";
import type { Faixa } from "@/modulos/vendas/regras";
import { cn } from "@/lib/utils";
import { Check, Copy, HandCoins, Link2, MessageCircle, Unlink } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { botaoPrimario, botaoSecundario, campo, ConfirmButton, dataBR, formatBRL, Janela, parseValorBR } from "./base";

export function Fechamento({
  admin,
  mes,
  vendedorId,
  vendedorNome,
  resumo,
  margem,
  observacoesSalvas,
  codigo,
  whatsapp,
  adiantamentos,
  hoje,
  fechadoEm,
}: {
  admin: boolean;
  mes: string;
  vendedorId: number;
  vendedorNome: string;
  resumo: ResumoLI;
  margem: Faixa;
  observacoesSalvas: string;
  codigo: string | null;
  whatsapp: string | null;
  adiantamentos: { id: number; valor: number; data: string }[];
  hoje: string;
  /** fechamento gravado: % e quando; null = mês aberto */
  fechadoEm: { faixa: Faixa; quando: string; difere: boolean } | null;
}) {
  const [adiantando, setAdiantando] = useState(false);
  const [obs, setObs] = useState(observacoesSalvas);
  const [salvo, setSalvo] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<"texto" | "link" | null>(null);
  const [pending, startTransition] = useTransition();
  const [numero, setNumero] = useState(whatsapp ?? "");
  const [numeroMsg, setNumeroMsg] = useState<string | null>(null);

  // a URL completa depende do domínio em que a página está aberta (no servidor: vazio)
  const origem = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const link = codigo && origem ? `${origem}/r/${codigo}` : null;
  const texto = textoFechamento({ mes, resumo, margem, observacoes: obs, link, adiantamentos });

  function salvarNumero() {
    if (numero.replace(/\D/g, "") === (whatsapp ?? "")) return;
    startTransition(async () => {
      const r = await salvarWhatsapp(numero);
      setNumeroMsg(r.erro ?? "Salvo");
    });
  }

  function salvarObs() {
    if (salvo || !admin) return;
    startTransition(async () => {
      const r = await salvarObservacoes(mes, vendedorId, obs);
      if (r.erro) setMsg(r.erro);
      else setSalvo(true);
    });
  }

  /** Enviar pro Rodrigo: salva as observações e grava o fechamento no % escolhido. */
  function enviar() {
    salvarObs();
    startTransition(async () => {
      const r = await registrarFechamento(mes, vendedorId, margem);
      setMsg(r.erro ? `Mensagem aberta, mas o fechamento não foi salvo: ${r.erro}` : null);
    });
  }

  async function copiar(qual: "texto" | "link") {
    try {
      await navigator.clipboard.writeText(qual === "texto" ? texto : (link ?? ""));
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setMsg("Não consegui copiar. Selecione e copie à mão.");
    }
  }

  return (
    <section className="glass-lite glass-static p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold text-white">
            Fechamento de {mesCapitalizado(mes).toLowerCase()}
            {admin && <span className="font-normal text-ink-dim"> · {vendedorNome}</span>}
          </h3>
          <p className="m-0 mt-0.5 text-[12px] text-ink-faint">
            {fechadoEm
              ? `Fechado em ${fechadoEm.faixa}% no dia ${dataBR(fechadoEm.quando.slice(0, 10))}.`
              : admin
                ? "Mês aberto: o “Enviar pro Rodrigo” grava o fechamento no % escolhido acima."
                : "Mês aberto: o % que vale é o que o admin escolher no fechamento."}
            {fechadoEm?.difere && <span className="text-accent-3"> As vendas mudaram depois do fechamento: envie de novo para atualizar.</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && (
            <button type="button" onClick={() => setAdiantando(true)} className={cn(botaoSecundario, "inline-flex items-center gap-1.5")}>
              <HandCoins size={13} /> Registrar adiantamento
            </button>
          )}
          <button type="button" onClick={() => copiar("texto")} className={cn(botaoSecundario, "inline-flex items-center gap-1.5")}>
            {copiado === "texto" ? <Check size={13} /> : <Copy size={13} />}
            {copiado === "texto" ? "Copiado" : "Copiar"}
          </button>
          {admin && (
            <a
              href={`https://wa.me/${whatsapp ?? ""}?text=${encodeURIComponent(texto)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={enviar}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-background transition-colors hover:bg-white"
            >
              <MessageCircle size={14} /> Enviar pro Rodrigo
            </a>
          )}
        </div>
      </div>

      {adiantamentos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-line-soft px-3 py-2 text-[12.5px] tabular-nums text-ink-dim">
          <span>comissão {formatBRL(resumo.comissao[margem])}</span>
          {adiantamentos.map((a) => (
            <span key={a.id}>
              adiantamento {dataBR(a.data).slice(0, 5)}: −{formatBRL(a.valor)}
            </span>
          ))}
          <span className="text-white">a receber {formatBRL(valorFinalDe(resumo.comissao[margem], adiantamentos))}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {admin && (
            <label className="text-xs text-ink-dim">
              WhatsApp do Rodrigo <span className="text-ink-faint">(DDI + DDD + número)</span>
              <input
                value={numero}
                onChange={(e) => {
                  setNumero(e.target.value);
                  setNumeroMsg(null);
                }}
                onBlur={salvarNumero}
                inputMode="tel"
                autoComplete="off"
                placeholder="5521999999999"
                className={`${campo} mt-1 tabular-nums`}
              />
              {numeroMsg && <span className={cn("mt-1 block text-[11.5px]", numeroMsg === "Salvo" ? "text-ink-faint" : "text-accent-3")}>{numeroMsg}</span>}
            </label>
          )}
          <label className="text-xs text-ink-dim">
            Observações do mês <span className="text-ink-faint">(entram no bloco de observações)</span>
            <textarea
              value={obs}
              readOnly={!admin}
              onChange={(e) => {
                setObs(e.target.value);
                setSalvo(false);
              }}
              onBlur={salvarObs}
              rows={4}
              maxLength={4000}
              placeholder={admin ? "Ex.: 3 combos Game Changer fora da comissão; 2 vendas sem UTM confirmadas" : "Sem observações."}
              className={`${campo} mt-1 resize-y`}
            />
          </label>
          {admin && <span className="-mt-2 text-[11.5px] text-ink-faint">{pending ? "Salvando…" : salvo ? "Salvo" : "Não salvo (salva ao sair do campo)"}</span>}

          {admin && (
            <div className="rounded-xl border border-line-soft px-3 py-2.5">
              <div className="mb-1.5 text-xs text-ink-dim">Link público do mês (só leitura, sem login)</div>
              {codigo ? (
                <div className="flex flex-col gap-2">
                  <code className="block truncate rounded-lg bg-bg-raised-2 px-2.5 py-1.5 text-[12px] text-ink">{link ?? "…"}</code>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => copiar("link")} className={cn(botaoSecundario, "inline-flex items-center gap-1.5")}>
                      {copiado === "link" ? <Check size={13} /> : <Link2 size={13} />}
                      {copiado === "link" ? "Link copiado" : "Copiar link"}
                    </button>
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className={botaoSecundario}>
                        Abrir
                      </a>
                    )}
                    <ConfirmButton
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          <Unlink size={13} /> Desativar link
                        </span>
                      }
                      pergunta="Desativar? O link para de funcionar na hora."
                      action={() => desativarLinkMes(mes, vendedorId)}
                      className={botaoSecundario}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startTransition(async () => setMsg((await gerarLinkMes(mes, vendedorId)).erro ?? null))}
                    disabled={pending}
                    className={cn(botaoSecundario, "inline-flex items-center gap-1.5")}
                  >
                    <Link2 size={13} /> Gerar link
                  </button>
                  <span className="text-[11.5px] text-ink-faint">sem link, a mensagem vai sem o bloco “Vendas de…”</span>
                </div>
              )}
            </div>
          )}
          {msg && (
            <p role="alert" className="m-0 text-xs text-accent-3">
              {msg}
            </p>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs text-ink-dim">Prévia da mensagem</div>
          <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line-soft bg-bg-raised-2 p-3 font-sans text-[12.5px] leading-relaxed text-ink">
            {texto}
          </pre>
        </div>
      </div>
      {adiantando && (
        <Adiantamentos mes={mes} vendedorId={vendedorId} hoje={hoje} lista={adiantamentos} onFechar={() => setAdiantando(false)} />
      )}
    </section>
  );
}

function Adiantamentos({
  mes,
  vendedorId,
  hoje,
  lista,
  onFechar,
}: {
  mes: string;
  vendedorId: number;
  hoje: string;
  lista: { id: number; valor: number; data: string }[];
  onFechar: () => void;
}) {
  const [data, setData] = useState(hoje.startsWith(mes) ? hoje : `${mes}-01`);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const c = parseValorBR(valor);
    if (!c) return setErro("Valor inválido. Ex.: 500,00");
    startTransition(async () => {
      const r = await criarAdiantamento(mes, vendedorId, c, data);
      if (r.erro) setErro(r.erro);
      else {
        setValor("");
        setErro(null);
      }
    });
  }

  return (
    <Janela titulo={`Adiantamentos de ${mesCapitalizado(mes).toLowerCase()}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-ink-dim">
            Valor (R$)
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="500,00" required autoFocus className={`${campo} mt-1 tabular-nums`} />
          </label>
          <label className="text-xs text-ink-dim">
            Dia
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required className={`${campo} mt-1 [color-scheme:dark]`} />
          </label>
        </div>
        {erro && (
          <p role="alert" className="m-0 text-xs text-accent-3">
            {erro}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={botaoPrimario}>
            {pending ? "Salvando…" : "Registrar"}
          </button>
          <button type="button" onClick={onFechar} className={botaoSecundario}>
            Fechar
          </button>
        </div>
      </form>
      {lista.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-line-soft pt-3">
          {lista.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 text-[13px] tabular-nums text-ink">
              <span>
                {dataBR(a.data)} · {formatBRL(a.valor)}
              </span>
              <ConfirmButton label="remover" pergunta="Remover?" action={() => removerAdiantamento(a.id)} className={botaoSecundario} />
            </li>
          ))}
        </ul>
      )}
    </Janela>
  );
}
