// Web Push (notificações no navegador e no celular com o app instalado). Só fala com o serviço de
// push do navegador (Google, Apple, Mozilla); quem recebe o quê é decidido em modulos/escala/alertas.ts.
// Chaves VAPID: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (URL do site).

import webpush from "web-push";

export type Inscricao = { endpoint: string; p256dh: string; auth: string };
export type Aviso = { titulo: string; corpo: string; url?: string; tag?: string; importante?: boolean };
/** O que o serviço de push respondeu (vai para notificacoes_enviadas.resultado). */
export type Envio = { situacao: "ok" | "expirada" | "erro" | "sem_chaves"; codigo?: number; detalhe?: string };

let configurado = false;
function configurar(): boolean {
  if (configurado) return true;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  const assunto = process.env.VAPID_SUBJECT?.trim();
  if (!publica || !privada || !assunto) return false;
  webpush.setVapidDetails(assunto, publica, privada);
  configurado = true;
  return true;
}

/**
 * Manda um aviso para um aparelho. "expirada" = o aparelho desativou ou a inscrição venceu
 * (404/410): quem chamou deve apagar a inscrição. Nunca lança erro: devolve o que aconteceu.
 */
export async function enviarPush(i: Inscricao, aviso: Aviso): Promise<Envio> {
  try {
    if (!configurar()) return { situacao: "sem_chaves", detalhe: "faltam as chaves VAPID no servidor" };
    const r = await webpush.sendNotification(
      { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
      JSON.stringify(aviso),
      // aviso de operação descoberta: entrega com prioridade; os outros podem esperar o aparelho acordar
      { TTL: 60 * 60, urgency: aviso.importante ? "high" : "normal" },
    );
    return { situacao: "ok", codigo: r.statusCode };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    const detalhe = String(err.body || err.message || "erro desconhecido").slice(0, 300);
    if (err.statusCode === 404 || err.statusCode === 410) return { situacao: "expirada", codigo: err.statusCode, detalhe };
    return { situacao: "erro", codigo: err.statusCode, detalhe };
  }
}
