import { describe, expect, test } from "vitest";
import { liquidezRF, ordenarRF, riscoRF } from "./perfilrf";

describe("liquidez e risco da renda fixa", () => {
  test("liquidez: Tesouro Selic diária, outros Tesouros a mercado, CDB depende da liquidez diária", () => {
    expect(liquidezRF({ tipo: "Tesouro Selic" })).toBe(0);
    expect(liquidezRF({ tipo: "Tesouro IPCA+" })).toBe(1);
    expect(liquidezRF({ tipo: "CDB", liquidezDiaria: true })).toBe(0);
    expect(liquidezRF({ tipo: "CDB" })).toBe(2);
    expect(liquidezRF({ tipo: "IPCA+ (outro)", liquidezDiaria: true })).toBe(2);
  });
  test("risco: soberano, FGC até R$ 250 mil, sem garantia", () => {
    expect(riscoRF({ tipo: "Tesouro Prefixado" }, 1e6)).toBe(0);
    expect(riscoRF({ tipo: "LCI" }, 250000)).toBe(1);
    expect(riscoRF({ tipo: "LCI" }, 250001)).toBe(2);
    expect(riscoRF({ tipo: "Prefixado (outro)" }, 1000)).toBe(2);
  });
  test("ordena pelo critério e desempata pelo maior líquido", () => {
    const rs = [
      { nome: "a", tipo: "CDB", liquido: 150, real: 110 },
      { nome: "b", tipo: "Tesouro IPCA+", liquido: 140, real: 120 },
      { nome: "c", tipo: "Tesouro Prefixado", liquido: 145, real: 105 },
      { nome: "d", tipo: "Prefixado (outro)", liquido: 160, real: 115 },
    ];
    expect(ordenarRF(rs, "liquido", 1000).map(r => r.nome)).toEqual(["d", "a", "c", "b"]);
    expect(ordenarRF(rs, "real", 1000).map(r => r.nome)).toEqual(["b", "d", "a", "c"]);
    expect(ordenarRF(rs, "risco", 1000).map(r => r.nome)).toEqual(["c", "b", "a", "d"]);
    expect(ordenarRF(rs, "liquidez", 1000).map(r => r.nome)).toEqual(["c", "b", "d", "a"]);
  });
});
