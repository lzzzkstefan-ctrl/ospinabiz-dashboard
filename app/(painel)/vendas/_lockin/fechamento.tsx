"use client";

// Fechamento do mês de UM vendedor (igual ao do Lock in): comissão, estornos, ajustes,
// adiantamentos, a receber, mensagem pro Rodrigo, observações e link público.
// Mês fechado fica travado: vale a comissão congelada no fechamento; reembolso de venda
// dele vira estorno no próximo fechamento. Admin reabre (com motivo) ou lança ajuste.
// Admin edita tudo; o vendedor só vê os números, as observações e a prévia.

import {
  criarAdiantamento,
  criarAjuste,
  desativarLinkMes,
  gerarLinkMes,
  reabrirMes,
  registrarFechamento,
  removerAdiantamento,
  salvarObservacoes,
  salvarWhatsapp,
} from "../acoes-lockin";
import { mesCapitalizado, rotuloEstorno, textoFechamento, valorFinalDe, type AjusteLI, type ResumoLI } from "@/modulos/vendas/lock-in";
import type { Faixa } from "@/modulos/vendas/regras";
import type { Alteracao, EstornoDoVendedor } from "@/modulos/vendas/tela";
import { cn } from "@/lib/utils";
import { Check, Copy, HandCoins, History, Link2, LockOpen, MessageCircle, SlidersHorizontal, Unlink } from "lucide-react";
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
  estornos,
  ajustes,
  alteracoes,
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
  /** todos os estornos do vendedor que valem; aqui entram os deste mês */
  estornos: EstornoDoVendedor[];
  ajustes: AjusteLI[];
  alteracoes: Alteracao[];
  hoje: string;
  /** fechamento gravado: %, quando e comissão congelada; null = mês aberto */
  fechadoEm: { faixa: Faixa; quando: string; difere: boolean; comissao: number } | null;
}) {
  const [adiantando, setAdiantando] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
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
  // mês fechado: comissão congelada + estornos descontados nele; aberto: comissão de agora +
  // estornos pendentes de meses anteriores (serão descontados quando fechar)
  const comissaoBase = fechadoEm ? fechadoEm.comissao : resumo.comissao[margem];
  const estornosDoMes = fechadoEm
    ? estornos.filter((e) => e.descontadoNoMes === mes)
    : estornos.filter((e) => e.descontadoNoMes === null && e.mesOrigem < mes);
  const aReceber = valorFinalDe(comissaoBase, adiantamentos, { estornos: estornosDoMes, ajustes });
  const temDescontos = adiantamentos.length > 0 || estornosDoMes.length > 0 || ajustes.length > 0;
  const texto = textoFechamento({ mes, resumo, margem, observacoes: obs, link, adiantamentos, comissao: comissaoBase, estornos: estornosDoMes, ajustes });

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

  /** Enviar pro Rodrigo: salva as observações e grava o fechamento no % escolhido (mês aberto). */
  function enviar() {
    salvarObs();
    if (fechadoEm) return; // mês fechado: só reenvia a mensagem
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
              ? `Fechado em ${fechadoEm.faixa}% no dia ${dataBR(fechadoEm.quando.slice(0, 10))}. Mês travado: vale a comissão do fechamento.`
              : admin
                ? "Mês aberto: o “Enviar pro Rodrigo” grava o fechamento no % escolhido acima."
                : "Mês aberto: o % que vale é o que o admin escolher no fechamento."}
            {fechadoEm?.difere && (
              <span className="text-accent-3">
                {" "}
                As vendas mudaram depois do fechamento. Reembolso vira estorno no próximo fechamento; para refazer o mês, reabra.
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && (
            <button type="button" onClick={() => setAdiantando(true)} className={cn(botaoSecundario, "inline-flex items-center gap-1.5")}>
              <HandCoins size={13} /> Registrar adiantamento
            </button>
          )}
          {admin && fechadoEm && (
            <>
              <button type="button" onClick={() => setAjustando(true)} className={cn(botaoSecundario, "inline-flex items-center gap-1.5")}>
                <SlidersHorizontal size={13} /> Ajuste
              </button>
              <button type="button" onClick={() => setReabrindo(true)} className={cn(botaoSecundario, "inline-flex items-center gap-1.5")}>
                <LockOpen size={13} /> Reabrir mês
              </button>
            </>
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

      {temDescontos && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-line-soft px-3 py-2 text-[12.5px] tabular-nums text-ink-dim">
          <span>
            comissão {fechadoEm ? "(fechada) " : ""}
            {formatBRL(comissaoBase)}
          </span>
          {estornosDoMes.map((e) => (
            <span key={`e${e.id}`}>
              {fechadoEm ? "estorno" : "estorno a descontar"} ({rotuloEstorno(e)}): −{formatBRL(e.valor)}
            </span>
          ))}
          {ajustes.map((a) => (
            <span key={`a${a.id}`} title={a.motivo}>
              ajuste: {a.valor < 0 ? "−" : "+"}
              {formatBRL(Math.abs(a.valor))}
            </span>
          ))}
          {adiantamentos.map((a) => (
            <span key={a.id}>
              adiantamento {dataBR(a.data).slice(0, 5)}: −{formatBRL(a.valor)}
            </span>
          ))}
          <span className={aReceber >= 0 ? "text-white" : "text-accent-3"}>
            {aReceber >= 0 ? `a receber ${formatBRL(aReceber)}` : `saldo negativo de ${formatBRL(-aReceber)}, descontado no próximo fechamento`}
          </span>
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
      {admin && alteracoes.length > 0 && <Registro alteracoes={alteracoes} />}
      {adiantando && (
        <Adiantamentos mes={mes} vendedorId={vendedorId} hoje={hoje} lista={adiantamentos} onFechar={() => setAdiantando(false)} />
      )}
      {ajustando && <Ajustes mes={mes} vendedorId={vendedorId} lista={ajustes} onFechar={() => setAjustando(false)} />}
      {reabrindo && <Reabrir mes={mes} vendedorId={vendedorId} vendedorNome={vendedorNome} onFechar={() => setReabrindo(false)} />}
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

function Ajustes({ mes, vendedorId, lista, onFechar }: { mes: string; vendedorId: number; lista: AjusteLI[]; onFechar: () => void }) {
  const [sinal, setSinal] = useState<"desconta" | "paga">("desconta");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const c = parseValorBR(valor);
    if (!c) return setErro("Valor inválido. Ex.: 50,00");
    if (motivo.trim().length < 5) return setErro("Escreva o motivo (mínimo 5 letras).");
    startTransition(async () => {
      const r = await criarAjuste(mes, vendedorId, sinal === "desconta" ? -c : c, motivo);
      if (r.erro) setErro(r.erro);
      else {
        setValor("");
        setMotivo("");
        setErro(null);
      }
    });
  }

  return (
    <Janela titulo={`Ajustes de ${mesCapitalizado(mes).toLowerCase()}`} onFechar={onFechar}>
      <p className="m-0 mb-3 text-[12px] text-ink-faint">
        Corrige o valor do mês fechado sem reabrir. Fica registrado e não se apaga: para desfazer, lance outro ajuste.
      </p>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-ink-dim">
            Tipo
            <select value={sinal} onChange={(e) => setSinal(e.target.value as "desconta" | "paga")} className={`${campo} mt-1`}>
              <option value="desconta">Descontar (−)</option>
              <option value="paga">Pagar a mais (+)</option>
            </select>
          </label>
          <label className="text-xs text-ink-dim">
            Valor (R$)
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="50,00" required autoFocus className={`${campo} mt-1 tabular-nums`} />
          </label>
        </div>
        <label className="text-xs text-ink-dim">
          Motivo
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            required
            placeholder="Ex.: venda de julho atribuída depois do fechamento"
            className={`${campo} mt-1`}
          />
        </label>
        {erro && (
          <p role="alert" className="m-0 text-xs text-accent-3">
            {erro}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={botaoPrimario}>
            {pending ? "Salvando…" : "Lançar ajuste"}
          </button>
          <button type="button" onClick={onFechar} className={botaoSecundario}>
            Fechar
          </button>
        </div>
      </form>
      {lista.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-line-soft pt-3">
          {lista.map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-3 text-[13px] tabular-nums text-ink">
              <span className="text-ink-dim">{a.motivo}</span>
              <span className="whitespace-nowrap">
                {a.valor < 0 ? "−" : "+"}
                {formatBRL(Math.abs(a.valor))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Janela>
  );
}

function Reabrir({ mes, vendedorId, vendedorNome, onFechar }: { mes: string; vendedorId: number; vendedorNome: string; onFechar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reabrir(e: React.FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 5) return setErro("Escreva o motivo (mínimo 5 letras).");
    startTransition(async () => {
      const r = await reabrirMes(mes, vendedorId, motivo);
      if (r.erro) setErro(r.erro);
      else onFechar();
    });
  }

  return (
    <Janela titulo={`Reabrir ${mesCapitalizado(mes).toLowerCase()} de ${vendedorNome}`} onFechar={onFechar}>
      <p className="m-0 mb-3 text-[12.5px] text-ink-dim">
        O mês volta a ficar aberto e o valor passa a ser recalculado pelas vendas. Estornos que nasceram deste mês e ainda não foram descontados são
        cancelados (o recálculo já pega o reembolso). Fica registrado quem reabriu e por quê.
      </p>
      <form onSubmit={reabrir} className="flex flex-col gap-3">
        <label className="text-xs text-ink-dim">
          Motivo (obrigatório)
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} required autoFocus className={`${campo} mt-1 resize-y`} />
        </label>
        {erro && (
          <p role="alert" className="m-0 text-xs text-accent-3">
            {erro}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={botaoPrimario}>
            {pending ? "Reabrindo…" : "Reabrir mês"}
          </button>
          <button type="button" onClick={onFechar} className={botaoSecundario}>
            Cancelar
          </button>
        </div>
      </form>
    </Janela>
  );
}

const ROTULO_TIPO: Record<string, string> = {
  venda_criada: "venda criada",
  venda_alterada: "venda alterada",
  mes_reaberto: "mês reaberto",
  ajuste_criado: "ajuste",
  estorno_criado: "estorno criado",
  estorno_cancelado: "estorno cancelado",
};

const valorCampo = (v: unknown) => (v === null || v === undefined || v === "" ? "vazio" : String(v));

/** Registro de alterações do mês (só admin). */
function Registro({ alteracoes }: { alteracoes: Alteracao[] }) {
  return (
    <details className="mt-3 rounded-xl border border-line-soft px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-dim">
        <History size={13} /> Registro de alterações ({alteracoes.length})
      </summary>
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {alteracoes.map((a) => (
          <li key={a.id} className="text-[12.5px] text-ink">
            <span className="tabular-nums text-ink-faint">
              {dataBR(a.em.slice(0, 10))} {a.em.slice(11, 16)}
            </span>{" "}
            · {a.quem} · {ROTULO_TIPO[a.tipo] ?? a.tipo}
            {a.vendaId !== null && <span className="text-ink-dim"> (venda #{a.vendaId})</span>}
            {a.motivo && <span className="text-ink-dim"> — {a.motivo}</span>}
            {a.campos.length > 0 && (
              <span className="block pl-3 text-ink-dim">{a.campos.map((c) => `${c.campo}: ${valorCampo(c.antes)} → ${valorCampo(c.depois)}`).join(" · ")}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
