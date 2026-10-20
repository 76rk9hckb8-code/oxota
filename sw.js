// Сервис-воркер: приложение и карта работают без интернета
const APP = "app-v1";
const TILES = "tiles-v1";
const APP_FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-180.png", "./icon-192.png", "./icon-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isTile = url =>
  url.hostname.endsWith("tile.openstreetmap.org") ||
  url.hostname === "server.arcgisonline.com";

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Фрагменты карты: сначала из памяти, иначе из сети и сохранить
  if (isTile(url)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") c.put(req.url, res.clone());
        return res;
      } catch {
        return new Response("", { status: 504 });
      }
    }));
    return;
  }

  // Само приложение: сначала сеть (чтобы получать обновления), без сети — из памяти
  // (при слабом сигнале в лесу ждём сеть не дольше 3 секунд)
  const net = Promise.race([
    fetch(req),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))
  ]);
  e.respondWith(
    net.then(res => {
      if (res.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) {
        const copy = res.clone();
        caches.open(APP).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
