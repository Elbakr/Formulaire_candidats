/* CaftanRH Service Worker — vanilla, no Workbox */
// Karim 2026-06-10 (perf mobile A4) : le cache porte un nom versionne ; au
// changement de ce nom, le handler `activate` purge tous les anciens caches.
// Les assets /_next/static/* sont content-hashes par Next (nouveau build =
// nouvelle URL = cache-miss = fetch), et les pages HTML sont en network-first,
// donc un utilisateur EN LIGNE recupere toujours le code frais.
// TODO (a valider, touche le build) : injecter VERCEL_GIT_COMMIT_SHA dans ce
// nom au build pour une invalidation 100% automatique a chaque deploy, au lieu
// du bump manuel ci-dessous.
const CACHE_VERSION = "caftanrh-shell-v74-2026-06-10-mobile-perf";
const SHELL_ASSETS = ["/", "/login", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for static assets and icons.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }),
      ),
    );
    return;
  }

  // Network-first for HTML pages, fall back to cached shell.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});

// ---- WebPush ---------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "CaftanRH", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "CaftanRH";
  const link = data.link || "/";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: link },
    tag: data.tag || undefined,
    requireInteraction: data.priority === "urgent",
  };
  event.waitUntil(
    (async () => {
      // Karim 2026-06-10 (chat WhatsApp) : si l'utilisateur regarde DEJA cette
      // conversation (fenetre au premier plan sur le meme lien), on n'affiche
      // PAS le push OS — le toast in-app (NotificationListener) suffit. C'est
      // exactement le comportement WhatsApp. On ne filtre que les liens /chat/*.
      if (link.startsWith("/chat/")) {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const viewingRoom = wins.some((c) => {
          try {
            return c.focused && new URL(c.url).pathname === link;
          } catch (_) {
            return false;
          }
        });
        if (viewingRoom) return;
      }
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((all) => {
        for (const c of all) {
          try {
            const u = new URL(c.url);
            if (u.pathname === url || c.url.endsWith(url)) {
              return c.focus();
            }
          } catch (_) {
            // ignore
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
