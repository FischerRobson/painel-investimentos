// Cliente da API: header do modo demonstração, token com renovação no 401, aviso de offline e mensagens de erro.
import { afterEach, describe, expect, test, vi } from "vitest";

type Chamada = { url: string; headers: Headers; body?: string };

// Carrega api.ts do zero (DEMO e o estado do login são lidos ao importar)
async function carregar({ demo = false, auth = false, refresh = "" } = {}) {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  if (demo) localStorage.setItem("demo", "1");
  if (refresh) localStorage.setItem("auth_refresh", refresh);
  const chamadas: Chamada[] = [];
  let tokens = 0;
  const respostas: Record<string, (c: Chamada) => Response> = {
    "/api/auth/config": () => Response.json(auth ? { enabled: true, domain: "https://login.exemplo", clientId: "cli" } : { enabled: false }),
    "https://login.exemplo/oauth2/token": () => Response.json({ access_token: `tok${++tokens}`, expires_in: 3600 }),
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const c = { url, headers: new Headers(init.headers), body: init.body?.toString() };
    chamadas.push(c);
    const r = respostas[url];
    return r ? r(c) : Response.json({ ok: true });
  }));
  const api = await import("./api");
  const ir = vi.spyOn(api.navegacao, "ir").mockImplementation(() => {});
  return { api, chamadas, respostas, ir };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("apiFetch", () => {
  test("sem login, chama direto e sem Authorization", async () => {
    const { api, chamadas } = await carregar();
    expect(await api.iniciarSessao()).toEqual({ loginAtivo: false, email: "" });
    await api.apiFetch("/api/carteira");
    const c = chamadas.at(-1)!;
    expect(c.url).toBe("/api/carteira");
    expect(c.headers.has("Authorization")).toBe(false);
    expect(c.headers.has("X-Painel-Demo")).toBe(false);
  });

  test("modo demonstração manda X-Painel-Demo: 1", async () => {
    const { api, chamadas } = await carregar({ demo: true });
    await api.iniciarSessao();
    await api.apiFetch("/api/carteira", { headers: { Accept: "application/json" } });
    const c = chamadas.at(-1)!;
    expect(c.headers.get("X-Painel-Demo")).toBe("1");
    expect(c.headers.get("Accept")).toBe("application/json");
  });

  test("com login: renova pelo refresh token guardado e manda o Bearer", async () => {
    const { api, chamadas } = await carregar({ auth: true, refresh: "rt1" });
    expect((await api.iniciarSessao()).loginAtivo).toBe(true);
    const token = chamadas.find(c => c.url.endsWith("/oauth2/token"))!;
    expect(token.body).toContain("grant_type=refresh_token");
    expect(token.body).toContain("refresh_token=rt1");
    await api.apiFetch("/api/carteira");
    expect(chamadas.at(-1)!.headers.get("Authorization")).toBe("Bearer tok1");
  });

  test("401: renova o token e tenta de novo uma vez", async () => {
    const { api, chamadas, respostas } = await carregar({ auth: true, refresh: "rt1" });
    await api.iniciarSessao();
    let primeira = true;
    respostas["/api/carteira"] = () => {
      if (primeira) { primeira = false; return new Response(null, { status: 401 }); }
      return Response.json({ ok: true });
    };
    const r = await api.apiFetch("/api/carteira");
    expect(r.status).toBe(200);
    const carteira = chamadas.filter(c => c.url === "/api/carteira");
    expect(carteira.map(c => c.headers.get("Authorization"))).toEqual(["Bearer tok1", "Bearer tok2"]);
  });

  test("sem refresh token, manda para o login do Cognito guardando a página de volta", async () => {
    const { api, ir } = await carregar({ auth: true });
    history.replaceState(null, "", "/novo/ferramentas#comparador");
    void api.iniciarSessao(); // não resolve: a página sai para o Cognito
    await vi.waitFor(() => expect(ir).toHaveBeenCalled());
    const destino = new URL(ir.mock.calls[0][0]);
    expect(destino.origin + destino.pathname).toBe("https://login.exemplo/oauth2/authorize");
    expect(destino.searchParams.get("redirect_uri")).toBe(location.origin + "/");
    expect(destino.searchParams.get("code_challenge_method")).toBe("S256");
    expect(JSON.parse(sessionStorage.getItem("pkce")!).back).toBe("/novo/ferramentas#comparador");
  });
});

describe("aviso de offline", () => {
  test("liga com X-Painel-Offline e desliga na próxima resposta normal", async () => {
    const { api, respostas } = await carregar();
    await api.iniciarSessao();
    const avisos: unknown[] = [];
    api.offlineStore.subscribe(() => avisos.push(api.offlineStore.get()));
    respostas["/api/carteira"] = () => Response.json({}, { headers: { "X-Painel-Offline": "2026-11-10T15:30:00Z" } });
    await api.apiFetch("/api/carteira");
    expect(api.offlineStore.get()?.salvoEm?.toISOString()).toBe("2026-11-10T15:30:00.000Z");
    delete respostas["/api/carteira"];
    await api.apiFetch("/api/carteira");
    expect(api.offlineStore.get()).toBeNull();
    expect(avisos).toHaveLength(2);
  });
});

describe("textoDoErro", () => {
  test("usa error, depois as violações da validação, depois o status", async () => {
    const { api } = await carregar();
    expect(await api.textoDoErro(Response.json({ error: "sem saldo" }, { status: 400 }))).toBe("sem saldo");
    expect(await api.textoDoErro(Response.json({ violations: [{ field: "put.doc.valor", message: "deve ser positivo" }] }, { status: 400 })))
      .toBe("valor: deve ser positivo");
    expect(await api.textoDoErro(new Response("x", { status: 503 }))).toBe("HTTP 503");
  });
});

describe("getJson", () => {
  test("{error} com status 200 (fonte externa fora do ar) vira ErroApi", async () => {
    const { api, respostas } = await carregar();
    respostas["/api/fx?days=2"] = () => Response.json({ error: "Câmbio indisponível agora: 429" });
    await expect(api.getJson("/api/fx?days=2")).rejects.toMatchObject({ message: "Câmbio indisponível agora: 429", status: 200 });
    respostas["/api/x"] = () => Response.json({ prices: {}, error: "parcial" });
    expect(await api.getJson("/api/x")).toEqual({ prices: {}, error: "parcial" });
    expect(await api.getJson("/api/y")).toEqual({ ok: true });
  });
});
