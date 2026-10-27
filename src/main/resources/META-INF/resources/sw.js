// Service worker do painel: abre sem internet mostrando os últimos dados carregados.
//  - Páginas: rede primeiro (mudanças aparecem na hora); ícones e Chart.js: cache primeiro (troque VERSION para renovar).
//  - GET /api/*: rede primeiro; se falhar, devolve a última resposta salva com o header X-Painel-Offline.
//  - PUT/POST nunca passam pelo cache.
const VERSION = "painel-v2";
const DATA = "painel-dados";
const SHELL = [
  "/", "/carteira", "/projecao", "/ativos", "/moedas", "/bens", "/custos",
  "/manifest.json", "/icons/icon-192.png", "/icons/apple-touch-icon.png",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== DATA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", e => {
  if (e.data === "limpar-dados") e.waitUntil(caches.delete(DATA)); // no logout
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.startsWith("/api/")) {
    e.respondWith(dadosRedePrimeiro(req));
  } else if (sameOrigin && req.mode === "navigate") {
    e.respondWith(paginaRedePrimeiro(req));
  } else if (SHELL.includes(sameOrigin ? url.pathname : url.href)) {
    e.respondWith(caches.match(req).then(c => c || fetch(req)));
  }
});

async function paginaRedePrimeiro(req) {
  try {
    const r = await fetch(req);
    if (r.ok && !new URL(req.url).search) (await caches.open(VERSION)).put(req, r.clone());
    return r;
  } catch (err) {
    const url = new URL(req.url);
    return (await caches.match(url.pathname)) || (await caches.match("/")) || Response.error();
  }
}

async function dadosRedePrimeiro(req) {
  const cache = await caches.open(DATA);
  try {
    const r = await fetch(req);
    if (r.ok) {
      const headers = new Headers(r.headers);
      headers.set("X-Painel-Salvo-Em", new Date().toISOString());
      await cache.put(req.url, new Response(await r.clone().blob(), { status: r.status, headers }));
    }
    return r;
  } catch (err) {
    const saved = await cache.match(req.url);
    if (!saved) throw err;
    const headers = new Headers(saved.headers);
    headers.set("X-Painel-Offline", saved.headers.get("X-Painel-Salvo-Em") || "");
    return new Response(await saved.blob(), { status: 200, headers });
  }
}
