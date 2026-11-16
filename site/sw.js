const CACHE = "havamal-v1-shell-2";
const FILES = [
  "index.html",
  "styles.css",
  "app.js",
  "srs.js",
  "import-text.js",
  "manifest.webmanifest",
  "data/stanzas.json",
  "fonts/ebgaramond-480.woff2",
  "fonts/OFL.txt",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
];

const ROOT = new URL("./", self.location);
const URLS = FILES.map((file) => new URL(file, ROOT).href);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const indexUrl = new URL("index.html", ROOT).href;
    if (req.mode === "navigate") {
      const cachedNav = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(indexUrl));
      if (cachedNav) return cachedNav;
    }
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && (res.type === "basic" || res.type === "default")) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      if (req.mode === "navigate") {
        const fallback = await cache.match(indexUrl);
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
