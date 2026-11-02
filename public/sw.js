// Service worker da Ospinabiz: só notificações push (sem cache offline).
// Recebe o aviso do servidor, mostra e confirma o recebimento; clicar abre a página do aviso.
// Suba VERSAO a cada mudança: o arquivo muda, o navegador instala sozinho e a versão vai no recibo.
const VERSAO = 4;

const GENERICO = { titulo: "Ospinabiz", corpo: "Você tem um novo aviso. Abra o app para ver." };

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function lerAviso(event) {
  if (!event.data) return GENERICO;
  try {
    const aviso = event.data.json();
    return aviso && typeof aviso === "object" ? aviso : GENERICO;
  } catch {
    try {
      return { titulo: GENERICO.titulo, corpo: event.data.text() || GENERICO.corpo };
    } catch {
      return GENERICO;
    }
  }
}

// Todo push termina com notificação na tela: no iPhone, push sem notificação faz o Safari cortar a inscrição.
async function mostrar(aviso) {
  try {
    await self.registration.showNotification(aviso.titulo || GENERICO.titulo, {
      body: aviso.corpo || "",
      icon: "/icone-192.png?v=3",
      badge: "/selo-notificacao.png",
      tag: aviso.tag,
      // aviso da mesma coisa (ex.: a mesma pausa) substitui o anterior, mas toca de novo
      renotify: !!aviso.tag,
      // operação descoberta fica na tela até alguém mexer
      requireInteraction: !!aviso.importante,
      vibrate: aviso.importante ? [300, 120, 300, 120, 300] : [120, 60, 120],
      data: { url: aviso.url || "/escala" },
    });
  } catch {
    await self.registration.showNotification(GENERICO.titulo, { body: GENERICO.corpo, icon: "/icone-192.png?v=3", data: { url: "/escala" } });
  }
}

// Recibo: só o id da entrega, que identifica aviso, pessoa e aparelho. Falhar aqui não atrapalha o aviso.
async function confirmar(aviso) {
  if (!aviso.entrega) return;
  const corpo = JSON.stringify({ entrega: aviso.entrega, versao: VERSAO });
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await fetch("/api/push/recebido", { method: "POST", headers: { "content-type": "application/json" }, body: corpo, keepalive: true });
      if (r.ok) return;
    } catch {}
    await new Promise((pronto) => setTimeout(pronto, 2000));
  }
}

self.addEventListener("push", (event) => {
  const aviso = lerAviso(event);
  event.waitUntil(mostrar(aviso).then(() => confirmar(aviso)));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/escala", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin) && "focus" in j) {
          j.navigate(url);
          return j.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
