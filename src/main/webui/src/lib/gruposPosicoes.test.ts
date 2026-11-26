import { describe, expect, it } from "vitest";
import { agrupaPosicoes } from "./gruposPosicoes";
import type { LinhaPosicao } from "./dados";

const l = (kind: LinhaPosicao["kind"], asset: string, pv: number, extra: Partial<LinhaPosicao> = {}): LinhaPosicao =>
  ({ kind, key: asset, asset, notional: 1, price: pv, pv, ppv: pv - 1, pnl: 1, ...extra });

describe("agrupaPosicoes", () => {
  const linhas = [l("stock", "ITSA4", 10), l("stock", "HGLG11", 20), l("stock", "AAPL", 30, { currency: "USD" }), l("stock", "IVVB11", 5),
    l("fixedIncome", "CDB", 100), l("crypto", "BTC", 50), l("fx", "USD", 7, { pnl: null })];
  const g = agrupaPosicoes(linhas, { IVVB11: "etf" }, { HGLG11: "FII" });
  it("separa por tipo, na ordem fixa, com os subtotais", () => {
    expect(g.map(x => x.nome)).toEqual(["Renda fixa", "Ações", "FIIs", "ETFs e BDRs", "Exterior", "Cripto", "Moedas"]);
    expect(g.map(x => x.linhas[0].asset)).toEqual(["CDB", "ITSA4", "HGLG11", "IVVB11", "AAPL", "BTC", "USD"]);
    expect(g.reduce((s, x) => s + x.pv, 0)).toBe(222);
  });
  it("grupo sem nenhum PnL fica sem subtotal de PnL", () => expect(g.at(-1)!.pnl).toBeNull());
  it("a classe das operações vale mais que o tipo da cotação, e BDR fica com os ETFs", () => {
    expect(agrupaPosicoes([l("stock", "X11", 1)], { X11: "bdr" }, { X11: "FII" })[0].id).toBe("etf");
  });
});
