// Service worker: offline screen, fast static files, push notifications. Bump VERSION to refresh caches.
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE, "/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // bills, payments, orders always go to the server
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // app code and fonts never change for a given file name: cache first
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  // pages: always fresh from the server; show the offline screen when there is no internet
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
  }
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "New update", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Restaurant", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: d.icon || "/icon-192.png", badge: "/icon-192.png",
    data: { url: d.url || "/" }, requireInteraction: !!d.sticky, vibrate: [200, 100, 200],
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const w of list) if (w.url === target && "focus" in w) return w.focus();
    for (const w of list) if ("navigate" in w && w.url.startsWith(self.location.origin)) return w.navigate(target).then((x) => x && x.focus());
    return self.clients.openWindow(target);
  }));
});
