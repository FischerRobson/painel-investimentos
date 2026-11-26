import { describe, expect, it } from "vitest";
import { cet, simulaMoradia, tabelaFinanciamento, type CfgMoradia } from "./moradia";

const base: CfgMoradia = {
  valor: 500_000, entrada: 100_000, custosCompra: 5, juros: 11, prazo: 360, sistema: "sac", seguros: 100, tarifas: 0,
  manutencao: 1, aluguel: 2500, reajuste: 4.5, valorizacao: 4.5, rendimento: 12, anos: 30,
};
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("tabelaFinanciamento", () => {
  const i = Math.pow(1.12, 1 / 12) - 1;
  it("SAC: amortização constante, prestação que cai e saldo zerado", () => {
    const t = tabelaFinanciamento(120_000, 12, 120, "sac");
    expect(t[0].amortizacao).toBeCloseTo(1000, 8);
    expect(t[0].juros).toBeCloseTo(120_000 * i, 8);
    expect(t[119].prestacao).toBeCloseTo(1000 * (1 + i), 8);
    expect(t[119].saldo).toBeCloseTo(0, 6);
    // juros do SAC = i × F × (n + 1) / 2
    expect(soma(t.map(p => p.juros))).toBeCloseTo(i * 120_000 * 121 / 2, 4);
  });
  it("Price: prestação constante e total de juros maior que no SAC", () => {
    const p = tabelaFinanciamento(120_000, 12, 120, "price"), s = tabelaFinanciamento(120_000, 12, 120, "sac");
    expect(p[0].prestacao).toBeCloseTo(p[119].prestacao, 6);
    expect(p[119].saldo).toBeCloseTo(0, 4);
    expect(soma(p.map(x => x.juros))).toBeGreaterThan(soma(s.map(x => x.juros)));
  });
  it("sem juros divide igualmente", () => {
    expect(tabelaFinanciamento(1200, 0, 12, "price")[0].prestacao).toBeCloseTo(100);
  });
});

describe("cet", () => {
  const pagar = tabelaFinanciamento(100_000, 12, 120, "price").map(p => p.prestacao);
  it("sem tarifas nem seguros é a própria taxa de juros", () => expect(cet(100_000, 0, pagar)).toBeCloseTo(12, 4));
  it("tarifa e seguro aumentam o CET", () => {
    expect(cet(100_000, 3000, pagar)!).toBeGreaterThan(12.5);
    expect(cet(100_000, 0, pagar.map(p => p + 50))!).toBeGreaterThan(12.5);
  });
});

describe("simulaMoradia", () => {
  it("quem aluga começa com a entrada e os custos investidos", () => {
    const s = simulaMoradia(base)!;
    expect(s.inicial).toBe(125_000);
    expect(s.pontos[0].alugar).toBe(125_000);
    expect(s.pontos[0].comprar).toBe(100_000);
    expect(s.razaoAluguel).toBeCloseTo(0.005);
    expect(s.pontos).toHaveLength(361);
  });
  it("sem juros, rendimento, valorização, custos nem aluguel, comprar à vista empata com guardar o dinheiro", () => {
    const s = simulaMoradia({ ...base, entrada: 500_000, custosCompra: 0, seguros: 0, manutencao: 0, aluguel: 0, valorizacao: 0, rendimento: 0, anos: 5 })!;
    expect(s.fim.comprar).toBeCloseTo(500_000);
    expect(s.fim.alugar).toBeCloseTo(500_000);
    expect(s.vencedor).toBe("empate");
  });
  it("no aluguel de equilíbrio os dois terminam iguais; abaixo dele alugar ganha e acima, comprar", () => {
    const e = simulaMoradia(base)!.equilibrio!;
    const em = (aluguel: number) => simulaMoradia({ ...base, aluguel })!;
    expect(Math.abs(em(e).fim.alugar - em(e).fim.comprar)).toBeLessThan(1);
    expect(em(e * 0.8).vencedor).toBe("alugar");
    expect(em(e * 1.2).vencedor).toBe("comprar");
  });
  it("horizonte menor que o prazo desconta o saldo devedor", () => {
    const s = simulaMoradia({ ...base, anos: 10 })!;
    expect(s.fim.saldoDevedor).toBeCloseTo(400_000 * 2 / 3, 2);
  });
  it("recusa entrada maior que o valor do imóvel", () => expect(simulaMoradia({ ...base, entrada: 600_000 })).toBeNull());
});
