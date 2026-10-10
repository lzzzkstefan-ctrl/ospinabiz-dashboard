// Web Push (notificações no navegador e no celular com o app instalado). Só fala com o serviço de
// push do navegador (Google, Apple, Mozilla); quem recebe o quê é decidido em modulos/escala/alertas.ts.
// Chaves VAPID: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (URL do site).

import webpush from "web-push";

export type Inscricao = { endpoint: string; p256dh: string; auth: string };
export type Aviso = { titulo: string; corpo: string; url?: string; tag?: string; importante?: boolean };

let configurado = false;
function configurar(): boolean {
  if (configurado) return true;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const assunto = process.env.VAPID_SUBJECT;
  if (!publica || !privada || !assunto) return false;
  webpush.setVapidDetails(assunto, publica, privada);
  configurado = true;
  return true;
}

/**
 * Manda um aviso para um aparelho. "expirada" = o aparelho desativou ou a inscrição venceu
 * (404/410): quem chamou deve apagar a inscrição.
 */
export async function enviarPush(i: Inscricao, aviso: Aviso): Promise<"ok" | "expirada" | "erro" | "sem_chaves"> {
  if (!configurar()) return "sem_chaves";
  try {
    await webpush.sendNotification(
      { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
      JSON.stringify(aviso),
      // aviso de operação descoberta: entrega com prioridade; os outros podem esperar o aparelho acordar
      { TTL: 60 * 60, urgency: aviso.importante ? "high" : "normal" },
    );
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "expirada";
    return "erro";
  }
}
