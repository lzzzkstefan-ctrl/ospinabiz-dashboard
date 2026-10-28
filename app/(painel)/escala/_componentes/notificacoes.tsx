"use client";

// Notificações push no Check-in: ativar neste aparelho (service worker /sw.js + permissão do
// navegador + inscrição guardada no banco), testar, desligar e escolher quais avisos receber.
// No iPhone só funciona com o app instalado (Compartilhar → Adicionar à Tela de Início) e aberto
// pelo ícone (iOS 16.4+). Docs: guides/progressive-web-apps.

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { inscreverAparelho, marcarDesligado, nomeDoAparelho, paraEnviar, situacaoDoAparelho, type SituacaoPush } from "@/lib/push-navegador";
import { useActionState, useEffect, useState } from "react";
import { apagarInscricao, confirmarInscricao, salvarInscricao, salvarPreferencias, testarNotificacao } from "../acoes";

type Situacao = "verificando" | SituacaoPush;

export function AtivarNotificacoes() {
  const [situacao, setSituacao] = useState<Situacao>("verificando");
  const [inscricao, setInscricao] = useState<PushSubscription | null>(null);
  const [estado, setEstado] = useState<EstadoForm>({});
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    situacaoDoAparelho()
      .then(async (r) => {
        // inscrição no aparelho que sumiu do banco volta sozinha
        if (r.inscricao) await confirmarInscricao(paraEnviar(r.inscricao), nomeDoAparelho()).catch(() => {});
        if (!vivo) return;
        setInscricao(r.inscricao);
        setSituacao(r.situacao);
      })
      .catch(() => vivo && setSituacao("sem_suporte"));
    return () => {
      vivo = false;
    };
  }, []);

  async function ativar() {
    setOcupado(true);
    setEstado({});
    try {
      const sub = await inscreverAparelho();
      if (sub === "negada") {
        setSituacao(Notification.permission === "denied" ? "bloqueado" : "sem_permissao");
        setEstado({ erro: "Permissão não dada. Sem ela o aparelho não recebe os avisos." });
        return;
      }
      marcarDesligado(false);
      const r = await salvarInscricao(paraEnviar(sub), nomeDoAparelho());
      setEstado(r);
      if (!r.erro) {
        setInscricao(sub);
        setSituacao("ligado");
      }
    } catch {
      setEstado({ erro: "Não deu para ativar neste navegador." });
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    if (!inscricao) return;
    setOcupado(true);
    const endpoint = inscricao.endpoint;
    await inscricao.unsubscribe().catch(() => {});
    marcarDesligado(true);
    setEstado(await apagarInscricao(endpoint));
    setInscricao(null);
    setSituacao("sem_permissao");
    setOcupado(false);
  }

  async function testar() {
    setOcupado(true);
    setEstado(await testarNotificacao());
    setOcupado(false);
  }

  const desligado = situacao === "sem_permissao" || situacao === "sem_inscricao";
  return (
    <div className="flex flex-col gap-2">
      {situacao === "verificando" && <p className="m-0 text-[13px] text-ink-faint">Verificando este aparelho…</p>}
      {situacao === "sem_suporte" && <p className="m-0 text-[13px] text-ink-dim">Este navegador não aceita notificações. Use Chrome, Edge, Firefox ou Safari atualizados.</p>}
      {situacao === "iphone_instalar" && (
        <p className="m-0 text-[13px] text-ink-dim">
          No iPhone: toque em <strong className="text-white">Compartilhar</strong> → <strong className="text-white">Adicionar à Tela de Início</strong>, abra a Ospinabiz pelo
          ícone novo e volte aqui para ativar (precisa do iOS 16.4 ou mais novo).
        </p>
      )}
      {situacao === "bloqueado" && (
        <p className="m-0 text-[13px] text-[rgb(var(--tag-laranja))]">
          As notificações estão bloqueadas para este site. Libere no cadeado ao lado do endereço (no iPhone: Ajustes → Notificações → Ospinabiz) e abra de novo.
        </p>
      )}
      {(desligado || situacao === "ligado") && (
        <div className="flex flex-wrap items-center gap-3">
          {desligado ? (
            <Button type="button" onClick={ativar} disabled={ocupado}>
              {ocupado ? "Ativando…" : "Ativar notificações"}
            </Button>
          ) : (
            <>
              <span className="flex items-center gap-2 text-[13.5px] text-white">
                <span className="h-2.5 w-2.5 rounded-full bg-[rgb(var(--tag-verde))]" aria-hidden /> Ativadas neste aparelho
              </span>
              <button type="button" onClick={desligar} disabled={ocupado} className="text-[12.5px] text-ink-dim underline-offset-4 hover:underline">
                desligar neste aparelho
              </button>
            </>
          )}
        </div>
      )}
      {situacao !== "verificando" && (
        // sempre visível: o teste vai para todos os aparelhos ativados da pessoa, não só este
        <div>
          <Button type="button" variant="outline" onClick={testar} disabled={ocupado}>
            Enviar notificação de teste
          </Button>
        </div>
      )}
      <Aviso estado={estado} />
    </div>
  );
}

/** Quais avisos a pessoa quer (vale para todos os aparelhos dela). */
export function FormPreferencias({ tipos, marcados }: { tipos: { id: string; nome: string }[]; marcados: Record<string, boolean> }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarPreferencias, {});
  return (
    <form action={acao} className="flex flex-col gap-2">
      {tipos.map((t) => (
        <label key={t.id} className="flex items-center gap-2.5 text-[13.5px] text-ink">
          <input type="checkbox" name={t.id} defaultChecked={marcados[t.id]} className="h-4 w-4 accent-[var(--accent)]" />
          {t.nome}
        </label>
      ))}
      <div className="mt-1 flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar avisos"}
        </Button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
