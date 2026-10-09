// Manipulador de notificações Push e cliques do Service Worker
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "Você tem um lembrete no JM Barberclub!" };
  }

  const title = payload.title || "JM Barberclub";
  const options = {
    body: payload.body || "Seu horário está se aproximando! Te esperamos na barbearia.",
    icon: "/icons/logo-192.png",
    badge: "/icons/logo-192.png",
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
