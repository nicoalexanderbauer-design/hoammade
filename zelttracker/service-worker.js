// Public installation shell only. Never cache portal pages, sessions, APIs or user content.
const CACHE_PREFIX = "zelttracker-public-";
const CACHE_NAME = `${CACHE_PREFIX}20261001-android2`;
const ROOT = "/zelttracker/";
const PUBLIC_ASSETS = [
  "android.html",
  "offline.html",
  "style.css",
  "install.js?v=20261001-android2",
  "manifest.webmanifest",
  "assets/icon-192.png",
  "assets/icon-512.png",
].map(path => new URL(`${ROOT}${path}`, self.location.origin).href);
const ASSET_URLS = new Set(PUBLIC_ASSETS);
const PUBLIC_NAVIGATIONS = new Set([`${ROOT}portal.html`, `${ROOT}android.html`, ROOT]);
const OFFLINE_URL = new URL(`${ROOT}offline.html`, self.location.origin).href;

function publicRequest(request) {
  if (request.method !== "GET" || request.headers.has("authorization")) return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && !url.username && !url.password;
}

function cacheableResponse(response) {
  return response.ok && response.type === "basic" && !response.redirected
    && !/(?:no-store|private)/i.test(response.headers.get("cache-control") || "");
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of PUBLIC_ASSETS) {
      const request = new Request(url, { credentials: "omit", cache: "reload" });
      const response = await fetch(request);
      if (!cacheableResponse(response)) throw new Error("Public installation asset unavailable");
      await cache.put(url, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (!publicRequest(request)) return;
  const url = new URL(request.url);
  // Exact URLs only. Recovery links, tokens and any other query strings bypass the worker.
  if (request.mode === "navigate" && !url.search && PUBLIC_NAVIGATIONS.has(url.pathname)) {
    event.respondWith((async () => {
      try {
        // No portal response is written to Cache Storage or reused across accounts.
        return await fetch(request, { cache: "no-store" });
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(OFFLINE_URL) || Response.error();
      }
    })());
    return;
  }
  if (!ASSET_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    const response = await fetch(new Request(url.href, { credentials: "omit", cache: "no-store" }));
    if (cacheableResponse(response)) await cache.put(url.href, response.clone());
    return response;
  })());
});
