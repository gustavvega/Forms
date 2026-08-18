const CACHE_NAME = "qa-hcg-v11";
const CORE_ASSETS = ["./manifest.json","./icon-192.png","./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isAverias = url.pathname.includes("/Forms/averias/");
  const isPageRequest = event.request.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/Forms/");

  // El módulo de averías debe mostrar siempre la versión más reciente.
  if (isAverias) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => response)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (isPageRequest) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
