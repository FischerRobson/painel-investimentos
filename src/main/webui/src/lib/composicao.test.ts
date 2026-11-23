// Composição da carteira e comparativo com o mercado.
import { describe, expect, test } from "vitest";
import { montarComposicao } from "./composicao";
import { calcularComparativo, pedidoComparativo, valorEm } from "./comparativo";
import type { Cambio } from "./cambio";

const DIA = 864e5;
const fx = { quotes: { USD: { bid: 5, pct: 1, low: 5, high: 5, name: "Dólar", time: 0 } }, history: {}, fetchedAt: 0 } as Cambio;

const base = (doc = {}) => montarComposicao({
  doc: {
    acoesFiis: [{ t: "ITSA4", q: 100 }, { t: "KNRI11", q: 10 }, { t: "AAPL", q: 2 }, { t: "XXXX3", q: 5 }],
    cripto: [{ t: "BTC", q: 0.5 }], moedas: [{ c: "USD", q: 100 }],
    bens: [{ id: "b1", type: "cars", brand: "1", model: "1", year: "1", apelido: null, last: { month: "x", price: 50_000 } }],
    ...doc,
  },
  ativos: {
    ITSA4: { ticker: "ITSA4", price: 10, change: 0.5, type: "Ação", div12m: 1 },
    KNRI11: { ticker: "KNRI11", price: 150, changePct: 0, type: "FII", div12m: 12 },
    AAPL: { ticker: "AAPL", price: 200, change: -2, currency: "USD", type: "Exterior" },
    XXXX3: { ticker: "XXXX3", error: "não encontrado" },
  },
  cripto: { BTC: { price: 300_000, changePct: 2 } },
  fx, rates: null, hoje: "2026-11-23",
  valorBem: b => b.last?.price ?? null,
});

describe("montarComposicao", () => {
  test("valores por classe, exterior convertido pelo dólar, bens fora dos investimentos", () => {
    const c = base();
    expect(c.vAcoes).toBe(1000 + 2000); // ITSA4 + AAPL (2 × 200 × 5)
    expect(c.vExt).toBe(2000);
    expect(c.vFiis).toBe(1500);
    expect(c.vCripto).toBe(150_000);
    expect(c.vFx).toBe(500);
    expect(c.total).toBe(3000 + 1500 + 150_000 + 500);
    expect(c.patrimonio).toBe(c.total + 50_000);
    expect(c.div12).toBe(100 + 120);
    expect(c.rv.find(r => r.t === "XXXX3")).toMatchObject({ ok: false, value: null, err: "não encontrado" });
  });

  test("variação do dia: change em reais, changePct quando não há change", () => {
    const c = base();
    expect(c.rv.find(r => r.t === "ITSA4")!.dayChg).toBe(50);
    expect(c.rv.find(r => r.t === "AAPL")!.dayChg).toBe(-20); // -2 × 2 × 5
    expect(c.cr[0].dayChg).toBeCloseTo(0.5 * (300_000 - 300_000 / 1.02));
  });

  test("sem câmbio, ação do exterior e moedas ficam sem valor", () => {
    const c = montarComposicao({
      doc: { acoesFiis: [{ t: "AAPL", q: 2 }], moedas: [{ c: "USD", q: 100 }] },
      ativos: { AAPL: { ticker: "AAPL", price: 200, currency: "USD" } }, cripto: {}, fx: null, rates: null, hoje: "2026-11-23", valorBem: () => null,
    });
    expect(c.rv[0].value).toBeNull();
    expect(c.mo[0].value).toBeNull();
    expect(c.total).toBe(0);
  });

  test("carteira vazia", () => {
    const c = montarComposicao({ doc: {}, ativos: {}, cripto: {}, fx: null, rates: null, hoje: "2026-11-23", valorBem: () => null });
    expect(c.vazia).toBe(true);
    expect(c.dayPct).toBeNull();
  });
});

describe("comparativo", () => {
  test("valorEm pega o último ponto até t (ou o primeiro)", () => {
    const s: [number, number][] = [[10, 1], [20, 2], [30, 3]];
    expect(valorEm(s, 5)).toBe(1);
    expect(valorEm(s, 25)).toBe(2);
    expect(valorEm(s, 99)).toBe(3);
  });

  test("carteira de um ativo acompanha o ativo; quem não tem histórico fica de fora", () => {
    const t0 = Date.UTC(2026, 0, 5, 21);
    const dias = [0, 1, 2].map(i => t0 + i * DIA);
    const c = base({ acoesFiis: [{ t: "ITSA4", q: 100 }, { t: "KNRI11", q: 10 }], cripto: [], moedas: [] });
    const pedido = pedidoComparativo(c);
    expect(pedido).toEqual({ fx: [], coins: [], tickers: ["ITSA4", "KNRI11"] });
    const r = calcularComparativo(
      { indices: { CDI: dias.map((t, i) => [t, 1 + i * 0.001]), IBOV: dias.map((t, i) => [t, 100 + i * 10]) } },
      [{ ticker: "ITSA4", points: dias.map((t, i) => [t, 10 * (1 + i * 0.1)]) }],
      c,
    );
    expect(r.fora).toEqual(["KNRI11"]);
    expect(r.ret.carteira).toBeCloseTo(20);
    expect(r.ret.IBOV).toBeCloseTo(20);
    expect(r.ret.CDI).toBeCloseTo(0.2);
    expect(r.series.IFIX).toEqual([]);
  });

  test("sem séries de mercado, falha (a página mostra o erro)", () => {
    expect(() => calcularComparativo({}, [], base())).toThrow();
  });
});
