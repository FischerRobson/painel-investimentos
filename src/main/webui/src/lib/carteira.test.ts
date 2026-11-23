// Persistência da carteira: ETag, PUT agrupado, conflito 412 e preservação dos campos que a página não conhece.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { carteiraStore, efeitos, textoSalvar } from "./carteira";

type Put = { headers: Headers; body: unknown };

let puts: Put[];
let getResp: () => Response;
let putResp: () => Response;

beforeEach(() => {
  vi.useFakeTimers();
  carteiraStore._reiniciar();
  puts = [];
  getResp = () => Response.json({ acoesFiis: [{ t: "ITSA4", q: 10 }], moedas: [], preferencias: { x: 1 }, campoNovo: "manter" }, { headers: { ETag: '"v1"' } });
  putResp = () => new Response(null, { status: 200, headers: { ETag: `"v${puts.length + 1}"` } });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url === "/api/auth/config") return Response.json({ enabled: false });
    if (init.method === "PUT") { puts.push({ headers: new Headers(init.headers), body: JSON.parse(String(init.body)) }); return putResp(); }
    return getResp();
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// Espera o debounce de 400 ms e a gravação
async function gravar() {
  await vi.advanceTimersByTimeAsync(450);
}

describe("carteiraStore", () => {
  test("carrega uma vez só, mesmo com várias páginas pedindo", async () => {
    await Promise.all([carteiraStore.carregar(), carteiraStore.carregar()]);
    expect(vi.mocked(fetch).mock.calls.filter(c => c[0] === "/api/carteira")).toHaveLength(1);
    expect(carteiraStore.get().doc?.campoNovo).toBe("manter");
  });

  test("alterações seguidas viram um PUT só, com If-Match da versão lida e o documento inteiro", async () => {
    await carteiraStore.carregar();
    carteiraStore.atualizar(d => ({ ...d, moedas: [{ c: "USD", q: 100 }] }));
    expect(textoSalvar(carteiraStore.get().salvar)).toBe("Salvando…");
    await vi.advanceTimersByTimeAsync(200);
    carteiraStore.atualizar(d => ({ ...d, moedas: [...(d.moedas ?? []), { c: "EUR", q: 50 }] }));
    await gravar();
    expect(puts).toHaveLength(1);
    expect(puts[0].headers.get("If-Match")).toBe('"v1"');
    expect(puts[0].body).toEqual({
      acoesFiis: [{ t: "ITSA4", q: 10 }], preferencias: { x: 1 }, campoNovo: "manter",
      moedas: [{ c: "USD", q: 100 }, { c: "EUR", q: 50 }],
    });
    expect(textoSalvar(carteiraStore.get().salvar)).toBe("Salvo ✓");
    await vi.advanceTimersByTimeAsync(2600);
    expect(textoSalvar(carteiraStore.get().salvar)).toBe("");
  });

  test("o próximo PUT usa o ETag devolvido pelo anterior", async () => {
    await carteiraStore.carregar();
    carteiraStore.atualizar(d => ({ ...d, moedas: [{ c: "USD", q: 1 }] }));
    await gravar();
    carteiraStore.atualizar(d => ({ ...d, moedas: [{ c: "USD", q: 2 }] }));
    await gravar();
    expect(puts.map(p => p.headers.get("If-Match"))).toEqual(['"v1"', '"v2"']);
  });

  test("carteira que ainda não existe (404) começa vazia e o primeiro PUT manda If-None-Match: *", async () => {
    getResp = () => new Response(null, { status: 404 });
    await carteiraStore.carregar();
    expect(carteiraStore.get().doc).toEqual({});
    carteiraStore.atualizar(d => ({ ...d, bens: [] }));
    await gravar();
    expect(puts[0].headers.get("If-None-Match")).toBe("*");
    expect(puts[0].headers.has("If-Match")).toBe(false);
  });

  test("412: outro dispositivo salvou antes, avisa e recarrega", async () => {
    const conflito = vi.spyOn(efeitos, "conflito").mockImplementation(() => {});
    putResp = () => new Response(null, { status: 412 });
    await carteiraStore.carregar();
    carteiraStore.atualizar(d => ({ ...d, moedas: [] }));
    await gravar();
    expect(conflito).toHaveBeenCalledOnce();
    expect(textoSalvar(carteiraStore.get().salvar)).toBe("Erro ao salvar: conflito");
  });

  test("erro do servidor aparece no estado de salvamento", async () => {
    putResp = () => Response.json({ error: "documento grande demais" }, { status: 400 });
    await carteiraStore.carregar();
    carteiraStore.atualizar(d => ({ ...d, moedas: [] }));
    await gravar();
    expect(textoSalvar(carteiraStore.get().salvar)).toBe("Erro ao salvar: documento grande demais");
  });

  test("falha ao carregar guarda o erro e deixa tentar de novo", async () => {
    getResp = () => Response.json({ error: "fora do ar" }, { status: 503 });
    await carteiraStore.carregar();
    expect(carteiraStore.get().erro).toBe("fora do ar");
    getResp = () => Response.json({ moedas: [] }, { headers: { ETag: '"v9"' } });
    await carteiraStore.carregar();
    expect(carteiraStore.get().doc).toEqual({ moedas: [] });
  });

  test("não deixa alterar antes de carregar", () => {
    expect(() => carteiraStore.atualizar(d => d)).toThrow("carteira ainda não carregada");
  });
});

describe("dados da versão antiga (localStorage)", () => {
  afterEach(() => localStorage.clear());

  test("sem carteira no servidor, oferece enviar e envia como backup uma vez só", async () => {
    localStorage.setItem("carteira", JSON.stringify([{ t: "ITSA4", q: 10 }]));
    localStorage.setItem("tickers", "ITSA4");
    let existe = false;
    const posts: unknown[] = [];
    getResp = () => existe ? Response.json({ acoesFiis: [{ t: "ITSA4", q: 10 }] }, { headers: { ETag: '"v1"' } }) : new Response(null, { status: 404 });
    vi.mocked(fetch).mockImplementation(async (url, init = {}) => {
      if (url === "/api/backup/import") { posts.push(JSON.parse(String(init.body))); existe = true; return new Response(null, { status: 204 }); }
      return getResp();
    });
    const perguntas: string[] = [];
    efeitos.confirmar = m => { perguntas.push(m); return true; };
    await carteiraStore.carregar();
    expect(perguntas).toHaveLength(1);
    expect(posts[0]).toMatchObject({ app: "painel-acoes", acoesFiis: [{ t: "ITSA4", q: 10 }], listaPainel: "ITSA4" });
    expect(carteiraStore.get().doc?.acoesFiis).toEqual([{ t: "ITSA4", q: 10 }]);
    expect(localStorage.getItem("migrado")).toBe("1");

    existe = false;
    await carteiraStore.recarregar();
    expect(perguntas).toHaveLength(1); // não pergunta de novo
    expect(carteiraStore.get().doc).toEqual({});
  });

  test("sem dados antigos, não pergunta nada", async () => {
    getResp = () => new Response(null, { status: 404 });
    efeitos.confirmar = () => { throw new Error("não deveria perguntar"); };
    await carteiraStore.carregar();
    expect(carteiraStore.get().doc).toEqual({});
  });
});
