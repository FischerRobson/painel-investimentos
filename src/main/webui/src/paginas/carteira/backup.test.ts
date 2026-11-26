import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import { importarBackup } from "./backup";

vi.mock("../../lib/api", () => ({ apiFetch: vi.fn(), textoDoErro: async (r: Response) => String(r.status) }));
vi.mock("../Ativos", () => ({ LISTA_PADRAO: "ITSA4" }));

const arquivo = (d: unknown) => ({ text: async () => JSON.stringify(d) }) as File;
const chamadas: { url: string; corpo: Record<string, unknown> }[] = [];
let falhar = "";

beforeEach(() => {
  chamadas.length = 0; falhar = ""; localStorage.clear();
  vi.stubGlobal("confirm", () => true);
  vi.stubGlobal("alert", vi.fn());
  vi.mocked(apiFetch).mockImplementation(async (url, init) => {
    chamadas.push({ url: String(url), corpo: JSON.parse(String(init?.body)) });
    return new Response(null, { status: url === falhar ? 400 : 204 });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("importar backup completo", () => {
  const dias = Array.from({ length: 65 }, (_, i) => ({ date: `d${i}` }));

  test("manda as posições em lotes de 30 e restaura as preferências do navegador", async () => {
    localStorage.setItem("planejador", '{"meta":1}');
    const ok = await importarBackup(arquivo({ app: "painel-acoes", posicoes: dias, preferenciasNavegador: { comparador: { valor: 5 }, auth_refresh: { x: 1 } } }));
    expect(ok).toBe(true);
    expect(chamadas.map(c => c.url)).toEqual(["/api/backup/import", ...Array(3).fill("/api/backup/positions")]);
    expect(chamadas[0].corpo).toEqual({ app: "painel-acoes" });
    expect(chamadas.slice(1).map(c => (c.corpo.days as unknown[]).length)).toEqual([30, 30, 5]);
    expect(localStorage.getItem("comparador")).toBe('{"valor":5}');
    expect(localStorage.getItem("planejador")).toBe('{"meta":1}'); // fora do arquivo: fica como está
    expect(localStorage.getItem("auth_refresh")).toBeNull(); // só as chaves conhecidas
  });

  test("backup antigo, sem posições, faz uma requisição só", async () => {
    expect(await importarBackup(arquivo({ app: "painel-acoes" }))).toBe(true);
    expect(chamadas).toHaveLength(1);
  });

  test("servidor recusa o backup: não mexe nas preferências nem manda posições", async () => {
    falhar = "/api/backup/import";
    expect(await importarBackup(arquivo({ app: "painel-acoes", posicoes: dias, preferenciasNavegador: { comparador: {} } }))).toBe(false);
    expect(chamadas).toHaveLength(1);
    expect(localStorage.getItem("comparador")).toBeNull();
  });

  test("falha nas posições avisa para importar de novo", async () => {
    falhar = "/api/backup/positions";
    expect(await importarBackup(arquivo({ app: "painel-acoes", posicoes: dias }))).toBe(true);
    expect(vi.mocked(alert).mock.calls[0][0]).toContain("Importe o mesmo arquivo de novo");
  });
});
