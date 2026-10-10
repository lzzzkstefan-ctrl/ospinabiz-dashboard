// Service worker da Ospinabiz: só notificações push (sem cache offline).
// Recebe o aviso do servidor (modulos/escala/alertas.ts) e mostra; clicar abre a página do aviso.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let aviso;
  try {
    aviso = event.data.json();
  } catch {
    aviso = { titulo: "Ospinabiz", corpo: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(aviso.titulo || "Ospinabiz", {
      body: aviso.corpo || "",
      icon: "/icone-192.png",
      badge: "/selo-notificacao.png",
      tag: aviso.tag,
      // aviso da mesma coisa (ex.: a mesma pausa) substitui o anterior, mas toca de novo
      renotify: !!aviso.tag,
      // operação descoberta fica na tela até alguém mexer
      requireInteraction: !!aviso.importante,
      vibrate: aviso.importante ? [300, 120, 300, 120, 300] : [120, 60, 120],
      data: { url: aviso.url || "/escala" },
    }),
  );
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
