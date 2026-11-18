// Cliente da API: login (Cognito + Google, authorization code com PKCE), token em toda chamada a /api/*, modo demonstração
// e aviso de dados offline. Mesmo fluxo do app atual (index.html), com as mesmas chaves no localStorage, então o login feito
// num app vale no outro.
//
// Durante a migração o redirect_uri continua sendo a raiz ("/"), a única URL de retorno cadastrada no Cognito: quem troca
// o código pelo token é o app atual, que depois volta para a página de origem (pkce.back, por exemplo /novo/ferramentas).
// O tratamento do ?code= daqui já fica pronto para quando o React passar a servir a raiz.
import { DEMO, store } from "./store";

type AuthConfig = { enabled: false } | { enabled: true; domain: string; clientId: string };

let auth: AuthConfig = { enabled: false };
let accessToken: string | null = null;
let tokenExp = 0;
let refreshing: Promise<void> | null = null;
let semRede = false; // a última tentativa de renovar o login falhou por falta de internet

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomStr = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const redirectUri = () => location.origin + "/";
function jwtPayload(t: string): Record<string, unknown> {
  try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return {}; }
}
const nunca = () => new Promise<never>(() => {}); // a página vai sair daqui (redirecionamento)
// Saída da página para o Cognito (separada para os testes, já que o jsdom não deixa trocar location.assign)
export const navegacao = { ir: (url: string) => location.assign(url) };

function cognito(): { domain: string; clientId: string } {
  if (!auth.enabled) throw new Error("login desligado");
  return auth;
}

async function tokenRequest(params: Record<string, string>): Promise<void> {
  const { domain, clientId } = cognito();
  const r = await fetch(domain + "/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, ...params }),
  });
  if (!r.ok) throw new Error("token " + r.status);
  const t = await r.json();
  accessToken = t.access_token;
  tokenExp = Date.now() + (t.expires_in || 3600) * 1000;
  if (t.refresh_token) store.set("auth_refresh", t.refresh_token);
  if (t.id_token) store.set("auth_email", String(jwtPayload(t.id_token).email || ""));
}

async function login(): Promise<never> {
  const { domain, clientId } = cognito();
  const verifier = randomStr(48), state = randomStr(16);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem("pkce", JSON.stringify({ verifier, state, back: location.pathname + location.search + location.hash }));
  navegacao.ir(domain + "/oauth2/authorize?" + new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: redirectUri(), identity_provider: "Google",
    scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256",
  }));
  return nunca();
}

export function logout(): void {
  store.set("auth_refresh", "");
  store.set("auth_email", "");
  navigator.serviceWorker?.controller?.postMessage("limpar-dados"); // apaga os dados guardados para uso offline
  if (!auth.enabled) return location.reload();
  navegacao.ir(auth.domain + "/logout?" + new URLSearchParams({ client_id: auth.clientId, logout_uri: redirectUri() }));
}

function refreshTokens(): Promise<void> {
  const rt = store.get("auth_refresh", "");
  if (!rt) { accessToken = null; return Promise.resolve(); }
  refreshing ??= tokenRequest({ grant_type: "refresh_token", refresh_token: rt })
    .then(() => { semRede = false; })
    .catch(e => {
      accessToken = null;
      // TypeError = sem internet: mantém o login guardado e usa os dados salvos
      if (e instanceof TypeError) semRede = true; else store.set("auth_refresh", "");
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export type Sessao = { loginAtivo: boolean; email: string };

// Roda antes de montar o app. Sem login (local) devolve na hora; com login, garante um token ou redireciona para o Cognito.
export async function iniciarSessao(): Promise<Sessao> {
  auth = await (await fetch("/api/auth/config")).json();
  if (!auth.enabled) return { loginAtivo: false, email: "" };
  const url = new URL(location.href), code = url.searchParams.get("code");
  if (code) { // voltando do Cognito
    const saved = JSON.parse(sessionStorage.getItem("pkce") || "{}");
    sessionStorage.removeItem("pkce");
    if (saved.state !== url.searchParams.get("state")) throw new Error("login inválido (state)");
    await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: saved.verifier });
    if (saved.back && saved.back !== location.pathname) { location.replace(saved.back); return nunca(); }
    history.replaceState(null, "", location.pathname);
  }
  if (!accessToken) await refreshTokens();
  if (!accessToken && !semRede) return login();
  return { loginAtivo: true, email: store.get("auth_email", "") };
}

// ---------- Aviso de offline ----------
// O service worker responde com os últimos dados salvos e o header X-Painel-Offline (data em que foram salvos; vazio se não souber).
type Offline = { salvoEm: Date | null } | null;
let offline: Offline = null;
const ouvintes = new Set<() => void>();
export const offlineStore = {
  get: (): Offline => offline,
  subscribe(fn: () => void) { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
};
function marcarOffline(r: Response): void {
  const salvoEm = r.headers.get("X-Painel-Offline");
  const novo: Offline = salvoEm === null ? null : { salvoEm: salvoEm ? new Date(salvoEm) : null };
  if (novo === null && offline === null) return;
  offline = novo;
  ouvintes.forEach(fn => fn());
}

// ---------- Chamadas à API ----------
// Toda chamada a /api/* leva o token; se expirar (401), renova e tenta de novo uma vez.
// Sem internet, a requisição segue sem token e o service worker responde com os últimos dados salvos.
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (DEMO) headers.set("X-Painel-Demo", "1");
  const r = await chamar(url, { ...init, headers });
  marcarOffline(r);
  return r;
}

async function chamar(url: string, init: RequestInit & { headers: Headers }): Promise<Response> {
  if (!auth.enabled || url.startsWith("/api/auth/")) return fetch(url, init);
  if (!accessToken || Date.now() > tokenExp - 60_000) await refreshTokens();
  if (!accessToken) return semRede ? fetch(url, init) : login();
  const call = () => { init.headers.set("Authorization", "Bearer " + accessToken); return fetch(url, init); };
  let r = await call();
  if (r.status === 401) {
    await refreshTokens();
    if (!accessToken) return semRede ? r : login();
    r = await call();
  }
  return r;
}

export class ErroApi extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Mensagem de erro da API: {error}, violações da validação ou o status HTTP.
export async function textoDoErro(r: Response): Promise<string> {
  const j = await r.json().catch(() => ({}));
  if (j.error) return j.error;
  if (j.violations?.length) {
    return j.violations.map((v: { field: string; message: string }) => `${v.field.split(".").slice(2).join(".")}: ${v.message}`).join("; ");
  }
  return "HTTP " + r.status;
}

// GET que devolve JSON ou lança ErroApi; é o que as queries do TanStack Query usam.
// Falha de fonte externa (câmbio, custos, brapi...) chega como HTTP 200 com {error} (ErrorResponse no backend): também vira ErroApi.
export async function getJson<T>(url: string): Promise<T> {
  const r = await apiFetch(url);
  if (!r.ok) throw new ErroApi(await textoDoErro(r), r.status);
  const j = await r.json();
  if (j && typeof j === "object" && !Array.isArray(j) && typeof j.error === "string" && Object.keys(j).length === 1) {
    throw new ErroApi(j.error, r.status);
  }
  return j as T;
}
