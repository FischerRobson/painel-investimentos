import { describe, expect, it } from "vitest";
import { daquiAnos, tesouroMaisProximo, type Tesouro, type TituloTesouro } from "./tesouro";

const tit = (tipo: string, vencimento: string, taxaCompra: number | null, taxaVenda: number | null = taxaCompra): TituloTesouro => ({
  tipo, vencimento, indexador: tipo.includes("IPCA") ? "ipca" : "pre", jurosSemestrais: tipo.includes("Juros"),
  taxaCompra, taxaVenda, puCompra: 1000, puVenda: 999, puBase: 999,
});
const td: Tesouro = { data: "2026-11-19", titulos: [
  tit("Tesouro Prefixado", "2026-12-01", 13), // vence logo depois da data base
  tit("Tesouro Prefixado", "2026-11-01", 99), // já venceu na data base
  tit("Tesouro Prefixado", "2029-01-01", 15.04, 15.16),
  tit("Tesouro Prefixado", "2032-01-01", 15.43, 15.55),
  tit("Tesouro IPCA+", "2035-05-15", 7.86),
  tit("Tesouro IPCA+ com Juros Semestrais", "2032-08-15", 7.77),
  tit("Tesouro IPCA+", "2032-08-15", null, 7.94), // sem taxa de compra (fora da venda)
] };

describe("tesouroMaisProximo", () => {
  it("escolhe o vencimento mais próximo do mesmo tipo", () => {
    expect(tesouroMaisProximo(td, "Tesouro Prefixado", "2031-06-01")?.vencimento).toBe("2032-01-01");
    expect(tesouroMaisProximo(td, "Tesouro Prefixado", "2029-03-01")?.taxaCompra).toBe(15.04);
  });
  it("ignora os já vencidos, os de outro tipo e os sem taxa do lado pedido", () => {
    expect(tesouroMaisProximo(td, "Tesouro Prefixado", "2026-01-01")?.vencimento).toBe("2026-12-01");
    expect(tesouroMaisProximo(td, "Tesouro IPCA+", "2032-08-15")?.vencimento).toBe("2035-05-15");
    expect(tesouroMaisProximo(td, "Tesouro IPCA+", "2032-08-15", "venda")?.vencimento).toBe("2032-08-15");
  });
  it("sem dados ou sem o tipo, não há título", () => {
    expect(tesouroMaisProximo(null, "Tesouro Prefixado", "2030-01-01")).toBeNull();
    expect(tesouroMaisProximo(td, "Tesouro Educa+", "2030-01-01")).toBeNull();
  });
});

describe("daquiAnos", () => {
  it("soma anos e frações em meses", () => {
    expect(daquiAnos("2026-11-26", 5)).toBe("2031-11-26");
    expect(daquiAnos("2026-11-26", 2.5)).toBe("2029-05-26");
  });
});
