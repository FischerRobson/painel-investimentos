import { describe, expect, it } from "vitest";
import { monteCarlo, percentil, sorteador, type CfgMonteCarlo } from "./montecarlo";

const fixo = (v: number) => ({ hoje: v, media: v, desvio: 0, persistencia: 0.5 });
const base: CfgMonteCarlo = {
  inicial: 10_000, aporte: 0, anos: 5, inflacao: { hoje: 5, media: 4.5, desvio: 1.5, persistencia: 0.6 },
  juroReal: { hoje: 7, media: 5, desvio: 2, persistencia: 0.7 }, pctCdi: 100, taxaIpca: 6, taxaPre: 12, simulacoes: 500,
};

describe("monteCarlo", () => {
  it("sorteio normal tem média 0 e desvio 1", () => {
    const n = sorteador(1), v = Array.from({ length: 50_000 }, n);
    const media = v.reduce((a, b) => a + b, 0) / v.length;
    expect(Math.abs(media)).toBeLessThan(0.02);
    expect(Math.sqrt(v.reduce((a, b) => a + (b - media) ** 2, 0) / v.length)).toBeCloseTo(1, 1);
  });
  it("percentil interpola", () => expect(percentil([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4));
  it("sem variação, bate com a conta à mão (IR de 15% e valor em reais de hoje)", () => {
    const r = monteCarlo({ ...base, inflacao: fixo(4), juroReal: fixo(6), simulacoes: 3 });
    const cdi = 1.06 * 1.04 - 1;
    const esperado = (taxa: number) => { const bruto = 10_000 * (1 + taxa) ** 5; return (bruto - (bruto - 10_000) * 0.15) / 1.04 ** 5; };
    expect(r.estrategias.pos.fim.p50).toBeCloseTo(esperado(cdi), 4);
    expect(r.estrategias.pre.fim.p10).toBeCloseTo(esperado(0.12), 4);
    expect(r.estrategias.ipca.fim.p90).toBeCloseTo(esperado(1.04 * 1.06 - 1), 4);
    expect(r.estrategias.pre.chanceMelhor).toBe(1);
  });
  it("mesmas premissas dão o mesmo resultado; outra semente muda", () => {
    expect(monteCarlo(base)).toEqual(monteCarlo(base));
    expect(monteCarlo({ ...base, semente: 7 }).estrategias.pos.fim.p50).not.toBe(monteCarlo(base).estrategias.pos.fim.p50);
  });
  it("faixas ordenadas e chances entre 0 e 1", () => {
    const r = monteCarlo({ ...base, aporte: 500, meta: 40_000 });
    expect(r.investidoReal).toBe(40_000);
    for (const e of Object.values(r.estrategias)) {
      for (const a of e.anos) { expect(a.p10).toBeLessThanOrEqual(a.p50); expect(a.p50).toBeLessThanOrEqual(a.p90); }
      expect(e.chanceMeta!).toBeGreaterThanOrEqual(0);
      expect(e.chanceMeta!).toBeLessThanOrEqual(1);
    }
    expect(Object.values(r.estrategias).reduce((s, e) => s + e.chanceMelhor, 0)).toBeCloseTo(1);
  });
  it("inflação mais incerta pesa mais no prefixado que no IPCA+", () => {
    const r = monteCarlo({ ...base, inflacao: { ...base.inflacao, desvio: 5 }, juroReal: fixo(5) });
    const largura = (f: { p10: number; p90: number }) => f.p90 - f.p10;
    expect(largura(r.estrategias.pre.fim)).toBeGreaterThan(largura(r.estrategias.ipca.fim) * 2);
  });
});
