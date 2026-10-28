"use client";

// Vigia das notificações push, em todas as telas do painel. A cada abertura (e quando o app volta
// para a frente):
// - inscrição no aparelho: confere se ainda está no banco (se sumiu, volta);
// - permissão dada mas sem inscrição (expirou ou foi apagada): cria de novo sozinho, sem perguntar;
// - sem permissão: mostra "Notificações desativadas, toque para ativar" (o navegador só deixa pedir
//   a permissão dentro de um toque, principalmente no iPhone);
// - bloqueado: mostra onde liberar.
// "Agora não" esconde por 3 dias neste aparelho; "desligar neste aparelho" (Check-in) cala de vez. iPhone fora do app instalado não tem push: nada aparece.

import { desligadoDeProposito, inscreverAparelho, marcarDesligado, nomeDoAparelho, paraEnviar, situacaoDoAparelho } from "@/lib/push-navegador";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { confirmarInscricao, salvarInscricao } from "../escala/acoes";

const CHAVE_ADIADO = "ospinabiz:push-adiado-ate";
const ADIAR_MS = 3 * 86_400_000;

function adiado(): boolean {
  try {
    return Number(localStorage.getItem(CHAVE_ADIADO) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function AvisoNotificacoes() {
  const [aviso, setAviso] = useState<"desativadas" | "bloqueadas" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    async function conferir() {
      const r = await situacaoDoAparelho();
      if (r.situacao === "ligado" && r.inscricao) {
        await confirmarInscricao(paraEnviar(r.inscricao), nomeDoAparelho());
        if (vivo) setAviso(null);
        return;
      }
      // desligou de propósito no Check-in: não religa nem insiste
      if (desligadoDeProposito()) return;
      if (r.situacao === "sem_inscricao") {
        // a permissão continua dada: refaz a inscrição sem perguntar nada
        const sub = await inscreverAparelho();
        if (sub !== "negada") {
          const s = await salvarInscricao(paraEnviar(sub), nomeDoAparelho());
          if (!s.erro) {
            if (vivo) setAviso(null);
            return;
          }
        }
      }
      if (!vivo || adiado()) return;
      if (r.situacao === "sem_permissao" || r.situacao === "sem_inscricao") setAviso("desativadas");
      else if (r.situacao === "bloqueado") setAviso("bloqueadas");
    }
    const rodar = () => void conferir().catch(() => {});
    const aoVoltar = () => document.visibilityState === "visible" && rodar();
    rodar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  async function ativar() {
    setOcupado(true);
    setErro(null);
    try {
      const sub = await inscreverAparelho();
      if (sub === "negada") {
        setAviso(Notification.permission === "denied" ? "bloqueadas" : "desativadas");
        setErro("Permissão não dada.");
        return;
      }
      marcarDesligado(false);
      const r = await salvarInscricao(paraEnviar(sub), nomeDoAparelho());
      if (r.erro) setErro(r.erro);
      else setAviso(null);
    } catch {
      setErro("Não deu para ativar neste navegador.");
    } finally {
      setOcupado(false);
    }
  }

  function adiar() {
    try {
      localStorage.setItem(CHAVE_ADIADO, String(Date.now() + ADIAR_MS));
    } catch {}
    setAviso(null);
  }

  if (!aviso) return null;
  return (
    <div
      role="status"
      className="glass-lite fixed inset-x-4 bottom-24 z-40 flex items-start gap-3 border-[rgb(var(--tag-laranja)/0.5)] p-3 md:inset-x-auto md:bottom-6 md:right-6 md:w-[360px] print:hidden"
    >
      {aviso === "desativadas" ? (
        <button type="button" onClick={ativar} disabled={ocupado} className="flex-1 text-left">
          <span className="block text-[13.5px] font-semibold text-white">{ocupado ? "Ativando…" : "Notificações desativadas, toque para ativar"}</span>
          <span className="block text-[12px] text-ink-dim">Sem isso este aparelho não recebe os avisos de venda, pausa e operação.</span>
          {erro && <span className="block text-[12px] text-[rgb(var(--tag-laranja))]">{erro}</span>}
        </button>
      ) : (
        <div className="flex-1">
          <span className="block text-[13.5px] font-semibold text-white">Notificações bloqueadas neste aparelho</span>
          <span className="block text-[12px] text-ink-dim">
            Libere no cadeado ao lado do endereço ou, no iPhone, em Ajustes → Notificações → Ospinabiz. Depois abra o app de novo.
          </span>
        </div>
      )}
      <button type="button" onClick={adiar} aria-label="Agora não" title="Agora não" className="text-ink-faint hover:text-white">
        <X size={16} />
      </button>
    </div>
  );
}
