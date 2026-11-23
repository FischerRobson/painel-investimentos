// Service worker do painel: abre sem internet mostrando os últimos dados carregados.
//  - Páginas (o index.html do React) e glossario.json: rede primeiro (mudanças aparecem na hora), cópia salva sem internet.
//  - /assets/* (JS e CSS do build, com hash no nome): cache primeiro. Os do index.html atual são baixados na instalação, e
//    os de versões antigas saem do cache ao ativar a versão nova.
//  - GET /api/*: rede primeiro; se falhar, devolve a última resposta salva com o header X-Painel-Offline.
//  - PUT/POST nunca passam pelo cache.
const VERSION = "painel-v7";
const DATA = "painel-dados";
const SHELL = ["/", "/glossario.json", "/manifest.json", "/icons/icon-192.png", "/icons/apple-touch-icon.png", "/icons/icon.svg"];

// JS e CSS que o index.html carrega (/assets/index-AbC123.js...)
const assetsDe = html => [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]))];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    const html = await (await cache.match("/")).text();
    await cache.addAll(assetsDe(html));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(k => k !== VERSION && k !== DATA).map(k => caches.delete(k)));
    // assets de builds antigos: fica só o que o index.html atual usa
    const cache = await caches.open(VERSION);
    const pagina = await cache.match("/");
    if (pagina) {
      const atuais = new Set(assetsDe(await pagina.text()));
      for (const req of await cache.keys()) {
        const p = new URL(req.url).pathname;
        if (p.startsWith("/assets/") && !atuais.has(p)) await cache.delete(req);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => {
  if (e.data === "limpar-dados") e.waitUntil(caches.delete(DATA)); // no logout
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) e.respondWith(dadosRedePrimeiro(req));
  else if (url.pathname.startsWith("/assets/")) e.respondWith(cachePrimeiro(req));
  else if (req.mode === "navigate") e.respondWith(paginaRedePrimeiro(req));
  else if (SHELL.includes(url.pathname)) e.respondWith(arquivoRedePrimeiro(req));
});

// Todas as rotas (/carteira, /orcamento#2026-01...) são o mesmo index.html: a cópia salva é a de "/"
async function paginaRedePrimeiro(req) {
  try {
    const r = await fetch(req);
    if (r.ok) (await caches.open(VERSION)).put("/", r.clone());
    return r;
  } catch (err) {
    return (await caches.match("/")) || Response.error();
  }
}

async function cachePrimeiro(req) {
  const salvo = await caches.match(req);
  if (salvo) return salvo;
  const r = await fetch(req);
  if (r.ok) (await caches.open(VERSION)).put(req, r.clone());
  return r;
}

// Conteúdo estático que muda com o deploy: busca sempre a versão nova e usa a guardada só sem internet.
async function arquivoRedePrimeiro(req) {
  try {
    const r = await fetch(req);
    if (r.ok) (await caches.open(VERSION)).put(req, r.clone());
    return r;
  } catch (err) {
    return (await caches.match(req)) || Response.error();
  }
}

async function dadosRedePrimeiro(req) {
  if (req.headers.get("X-Painel-Demo")) return fetch(req); // dados fictícios não ficam guardados no aparelho
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
