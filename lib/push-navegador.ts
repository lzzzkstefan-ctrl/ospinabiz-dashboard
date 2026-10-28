// Notificações push do lado do navegador (só roda no cliente): service worker /sw.js, permissão e
// inscrição no serviço de push. Usado pelo Check-in (ativar/desligar) e pelo aviso do painel
// (reativa sozinho quando a inscrição some). Quem guarda a inscrição no banco é a ação do servidor.

export type InscricaoNavegador = { endpoint: string; keys: { p256dh: string; auth: string } };

/** sem_suporte: navegador sem push; iphone_instalar: iPhone fora do app instalado (lá não há push). */
export type SituacaoPush = "sem_suporte" | "iphone_instalar" | "bloqueado" | "sem_permissao" | "sem_inscricao" | "ligado";

function chaveDoServidor(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const saida = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
  return saida;
}

export function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  const so = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "outro";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${nav} · ${so}`;
}

/** Inscrição como objeto simples (dá para mandar para a ação do servidor). */
export const paraEnviar = (sub: PushSubscription) => JSON.parse(JSON.stringify(sub)) as InscricaoNavegador;

/** Como está este aparelho agora (registra o service worker se precisar). Não pede nada ao usuário. */
export async function situacaoDoAparelho(): Promise<{ situacao: SituacaoPush; inscricao: PushSubscription | null }> {
  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return { situacao: iphone && !instalado ? "iphone_instalar" : "sem_suporte", inscricao: null };
  if (Notification.permission === "denied") return { situacao: "bloqueado", inscricao: null };
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const inscricao = await reg.pushManager.getSubscription();
  if (inscricao) return { situacao: "ligado", inscricao };
  return { situacao: Notification.permission === "granted" ? "sem_inscricao" : "sem_permissao", inscricao: null };
}

/**
 * Cria a inscrição deste aparelho. Com a permissão já dada não aparece pergunta nenhuma; sem ela, o
 * navegador pergunta (no iPhone só funciona dentro de um toque do usuário).
 */
export async function inscreverAparelho(): Promise<PushSubscription | "negada"> {
  const permissao = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permissao !== "granted") return "negada";
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveDoServidor(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
}

const CHAVE_DESLIGADO = "ospinabiz:push-desligado";

/** A pessoa desligou neste aparelho de propósito: o aviso do painel não religa nem insiste. */
export function desligadoDeProposito(): boolean {
  try {
    return localStorage.getItem(CHAVE_DESLIGADO) === "1";
  } catch {
    return false;
  }
}

export function marcarDesligado(desligado: boolean): void {
  try {
    if (desligado) localStorage.setItem(CHAVE_DESLIGADO, "1");
    else localStorage.removeItem(CHAVE_DESLIGADO);
  } catch {}
}
