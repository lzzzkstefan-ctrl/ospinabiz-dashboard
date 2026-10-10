"use client";

// Notificações push no Check-in: ativar neste aparelho (service worker /sw.js + permissão do
// navegador + inscrição guardada no banco), testar, desligar e escolher quais avisos receber.
// No iPhone só funciona com o app instalado (Compartilhar → Adicionar à Tela de Início) e aberto
// pelo ícone (iOS 16.4+). Docs: guides/progressive-web-apps.

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { useActionState, useEffect, useState } from "react";
import { apagarInscricao, salvarInscricao, salvarPreferencias, testarNotificacao, type InscricaoNavegador } from "../acoes";

function chaveDoServidor(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const saida = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
  return saida;
}

type Situacao = "verificando" | "sem_suporte" | "iphone_instalar" | "bloqueado" | "desligado" | "ligado";

function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  const so = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "outro";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${nav} · ${so}`;
}

export function AtivarNotificacoes() {
  const [situacao, setSituacao] = useState<Situacao>("verificando");
  const [inscricao, setInscricao] = useState<PushSubscription | null>(null);
  const [estado, setEstado] = useState<EstadoForm>({});
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      let s: Situacao;
      let sub: PushSubscription | null = null;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) s = iphone && !instalado ? "iphone_instalar" : "sem_suporte";
      else if (Notification.permission === "denied") s = "bloqueado";
      else {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        sub = await reg.pushManager.getSubscription();
        s = sub ? "ligado" : "desligado";
      }
      if (!vivo) return;
      setInscricao(sub);
      setSituacao(s);
    })().catch(() => vivo && setSituacao("sem_suporte"));
    return () => {
      vivo = false;
    };
  }, []);

  async function ativar() {
    setOcupado(true);
    setEstado({});
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setSituacao(permissao === "denied" ? "bloqueado" : "desligado");
        setEstado({ erro: "Permissão não dada. Sem ela o aparelho não recebe os avisos." });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveDoServidor(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
      const r = await salvarInscricao(JSON.parse(JSON.stringify(sub)) as InscricaoNavegador, nomeDoAparelho());
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
    setEstado(await apagarInscricao(endpoint));
    setInscricao(null);
    setSituacao("desligado");
    setOcupado(false);
  }

  async function testar() {
    setOcupado(true);
    setEstado(await testarNotificacao());
    setOcupado(false);
  }

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
          As notificações estão bloqueadas para este site. Libere no cadeado ao lado do endereço (ou nos ajustes do celular) e recarregue a página.
        </p>
      )}
      {(situacao === "desligado" || situacao === "ligado") && (
        <div className="flex flex-wrap items-center gap-3">
          {situacao === "desligado" ? (
            <Button type="button" onClick={ativar} disabled={ocupado}>
              {ocupado ? "Ativando…" : "Ativar notificações"}
            </Button>
          ) : (
            <>
              <span className="flex items-center gap-2 text-[13.5px] text-white">
                <span className="h-2.5 w-2.5 rounded-full bg-[rgb(var(--tag-verde))]" aria-hidden /> Ativadas neste aparelho
              </span>
              <Button type="button" variant="outline" onClick={testar} disabled={ocupado}>
                Testar
              </Button>
              <button type="button" onClick={desligar} disabled={ocupado} className="text-[12.5px] text-ink-dim underline-offset-4 hover:underline">
                desligar neste aparelho
              </button>
            </>
          )}
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
