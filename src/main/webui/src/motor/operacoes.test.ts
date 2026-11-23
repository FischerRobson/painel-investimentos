// Operações, preço médio e imposto de renda: casos conferidos à mão.
import { describe, expect, test } from "vitest";
import {
  apurarExterior, apurarIR, bensEDireitos, ehDiaDePregao, processar, quantidadesDaCarteira, rendimentosDoAno, rentabilidade,
  sugerirProventos, ultimoDiaUtil, type Operacao,
} from "./operacoes";

let n = 0;
const op = (data: string, tipo: Operacao["tipo"], ativo: string, qtd: number, preco: number, extra: Partial<Operacao> = {}): Operacao =>
  ({ id: String(++n), data, tipo, classe: "acao", ativo, qtd, preco, ...extra });

describe("preço médio e lucro realizado", () => {
  test("compras com taxas formam o preço médio; venda não muda o preço médio", () => {
    const { posicoes, realizados } = processar([
      op("2026-01-05", "compra", "ITSA4", 100, 10, { taxas: 2 }),
      op("2026-02-05", "compra", "ITSA4", 100, 12),
      op("2026-03-05", "venda", "ITSA4", 50, 13, { taxas: 1 }),
    ]);
    const p = posicoes.ITSA4;
    expect(p.qtd).toBe(150);
    expect(p.pm).toBeCloseTo(2202 / 200); // 11,01
    expect(realizados).toHaveLength(1);
    expect(realizados[0]).toMatchObject({ qtd: 50, venda: 650, liquido: 649, dayTrade: false });
    expect(realizados[0].lucro).toBeCloseTo(649 - 50 * 11.01);
  });

  test("zerou a posição, o preço médio recomeça", () => {
    const { posicoes } = processar([
      op("2026-01-05", "compra", "WEGE3", 10, 40), op("2026-01-10", "venda", "WEGE3", 10, 50), op("2026-02-01", "compra", "WEGE3", 10, 30),
    ]);
    expect(posicoes.WEGE3.pm).toBe(30);
  });

  test("desdobramento, grupamento e bonificação", () => {
    const { posicoes } = processar([
      op("2026-01-05", "compra", "BBAS3", 100, 50),
      { id: "d", data: "2026-02-01", tipo: "desdobramento", classe: "acao", ativo: "BBAS3", fator: 2 },
      op("2026-03-01", "bonificacao", "BBAS3", 20, 10), // 20 ações a R$ 10 de custo atribuído
      { id: "g", data: "2026-04-01", tipo: "grupamento", classe: "acao", ativo: "BBAS3", fator: 10 },
    ]);
    expect(posicoes.BBAS3.qtd).toBeCloseTo(22);
    expect(posicoes.BBAS3.custo).toBeCloseTo(5200);
  });

  test("vender mais do que tem vira aviso, e só a quantidade em carteira é realizada", () => {
    const r = processar([op("2026-01-05", "compra", "PETR4", 10, 30), op("2026-01-06", "venda", "PETR4", 15, 32)]);
    expect(r.alertas[0]).toContain("PETR4");
    expect(r.realizados[0].qtd).toBe(10);
    expect(r.realizados[0].venda).toBeCloseTo(320);
  });

  test("day trade: a parte casada no dia usa os preços do dia; o resto fica na posição", () => {
    const { posicoes, realizados } = processar([
      op("2026-01-05", "compra", "VALE3", 100, 60),
      op("2026-01-06", "compra", "VALE3", 50, 62),
      op("2026-01-06", "venda", "VALE3", 30, 63),
    ]);
    expect(realizados).toEqual([expect.objectContaining({ dayTrade: true, qtd: 30, lucro: 30 })]);
    expect(posicoes.VALE3.qtd).toBe(120);
    expect(posicoes.VALE3.custo).toBeCloseTo(6000 + 20 * 62);
  });

  test("exterior em reais pelo câmbio de cada data; cripto sem day trade", () => {
    const r = processar([
      op("2026-01-05", "compra", "AAPL", 10, 200, { classe: "exterior", cambio: 5 }),
      op("2026-06-05", "venda", "AAPL", 10, 200, { classe: "exterior", cambio: 5.5 }),
      op("2026-03-05", "compra", "BTC", 1, 300_000, { classe: "cripto" }),
      op("2026-03-05", "venda", "BTC", 0.5, 310_000, { classe: "cripto" }),
    ]);
    expect(r.realizados.find(x => x.ativo === "AAPL")!.lucro).toBeCloseTo(1000); // só o câmbio
    expect(r.realizados.find(x => x.ativo === "BTC")).toMatchObject({ dayTrade: false, lucro: 5000 });
  });
});

describe("imposto de renda mensal", () => {
  test("ações: vendas até R$ 20 mil no mês são isentas; acima, 15% com IRRF abatido", () => {
    const ops = [
      op("2026-01-02", "compra", "ITSA4", 2000, 10),
      op("2026-02-10", "venda", "ITSA4", 1000, 15), // vende R$ 15 mil: isento
      op("2026-03-10", "venda", "ITSA4", 1000, 25), // vende R$ 25 mil: lucro R$ 15 mil tributado
    ];
    const [fev, mar] = apurarIR(processar(ops).realizados);
    expect(fev).toMatchObject({ acoesIsentas: true, lucroAcoes: 5000, baseComum: 0, darfRV: 0 });
    expect(mar.acoesIsentas).toBe(false);
    expect(mar.baseComum).toBe(15_000);
    expect(mar.impostoRV).toBeCloseTo(2250);
    expect(mar.irrf).toBeCloseTo(25_000 * 0.00005);
    expect(mar.darfRV).toBeCloseTo(2250 - 1.25 - 15_000 * 0.00005); // o IRRF de fevereiro (mês isento) ficou de crédito
    expect(mar.vencimento).toBe("2026-04-30");
  });

  test("prejuízo compensa lucros futuros da mesma categoria, mesmo vindo de mês isento", () => {
    const ops = [
      op("2026-01-02", "compra", "ITSA4", 1000, 10), op("2026-01-02", "compra", "BOVA11", 100, 100, { classe: "etf" }),
      op("2026-02-10", "venda", "ITSA4", 1000, 8),                    // prejuízo de R$ 2.000, vendas de R$ 8 mil
      op("2026-03-10", "venda", "BOVA11", 100, 130, { classe: "etf" }), // ETF: lucro de R$ 3.000, sem isenção
    ];
    const [fev, mar] = apurarIR(processar(ops).realizados);
    expect(fev.prejuizoComum).toBe(2000);
    expect(mar.baseComum).toBe(1000);
    expect(mar.prejuizoComum).toBe(0);
  });

  test("FII: 20% e prejuízo só de FII; imposto abaixo de R$ 10 acumula para o mês seguinte", () => {
    const ops = [
      op("2026-01-02", "compra", "KNRI11", 10, 150, { classe: "fii" }),
      op("2026-02-10", "venda", "KNRI11", 5, 158, { classe: "fii" }), // lucro 40 → 8 de imposto (menos IRRF)
      op("2026-03-10", "venda", "KNRI11", 5, 160, { classe: "fii" }), // lucro 50 → 10
    ];
    const [fev, mar] = apurarIR(processar(ops).realizados);
    expect(fev.darfRV).toBe(0);
    expect(fev.acumuladoRV).toBeCloseTo(8 - 790 * 0.00005);
    expect(mar.darfRV).toBeCloseTo(fev.acumuladoRV + 10 - 800 * 0.00005);
  });

  test("day trade: 20% com IRRF de 1% do lucro", () => {
    const ops = [op("2026-05-04", "compra", "PETR4", 1000, 30), op("2026-05-04", "venda", "PETR4", 1000, 31)];
    const [mai] = apurarIR(processar(ops).realizados);
    expect(mai.baseDayTrade).toBe(1000);
    expect(mai.impostoRV).toBeCloseTo(200);
    expect(mai.irrf).toBeCloseTo(10);
  });

  test("cripto: isenta até R$ 35 mil de vendas no mês; acima, 15% do ganho", () => {
    const ops = [
      op("2026-01-02", "compra", "BTC", 1, 200_000, { classe: "cripto" }),
      op("2026-02-10", "venda", "BTC", 0.1, 300_000, { classe: "cripto" }), // R$ 30 mil: isento
      op("2026-03-10", "venda", "BTC", 0.2, 300_000, { classe: "cripto" }), // R$ 60 mil: ganho de R$ 20 mil
    ];
    const [fev, mar] = apurarIR(processar(ops).realizados);
    expect(fev).toMatchObject({ criptoIsenta: true, darfCripto: 0 });
    expect(mar.impostoCripto).toBeCloseTo(3000);
    expect(mar.darfCripto).toBeCloseTo(3000);
    expect(mar.impostoRV).toBe(0);
  });

  test("exterior: ganho anual, perdas compensam o ano seguinte", () => {
    const ext = (data: string, tipo: Operacao["tipo"], qtd: number, preco: number) => op(data, tipo, "AAPL", qtd, preco, { classe: "exterior", cambio: 5 });
    const anos = apurarExterior(processar([
      ext("2025-01-05", "compra", 10, 200), ext("2025-06-05", "venda", 5, 180), // perde R$ 500
      ext("2026-06-05", "venda", 5, 300),                                       // ganha R$ 2.500
    ]).realizados);
    expect(anos).toEqual([
      { ano: 2025, lucro: -500, base: 0, imposto: 0, prejuizo: 500 },
      { ano: 2026, lucro: 2500, base: 2000, imposto: 300, prejuizo: 0 },
    ]);
  });
});

describe("declaração anual", () => {
  test("bens e direitos pelo custo em 31/12, com grupo e código", () => {
    const ops = [
      op("2025-03-05", "compra", "ITSA4", 100, 10), op("2026-03-05", "compra", "ITSA4", 100, 12),
      op("2026-02-05", "compra", "KNRI11", 10, 150, { classe: "fii" }), op("2026-04-01", "compra", "BTC", 0.01, 300_000, { classe: "cripto" }),
    ];
    const bens = bensEDireitos(ops, 2026);
    const itsa = bens.find(b => b.ativo === "ITSA4")!;
    expect(itsa).toMatchObject({ qtdAntes: 100, custoAntes: 1000, qtd: 200, custo: 2200, grupo: "03 – Participações societárias", codigo: "01 – Ações" });
    expect(itsa.discriminacao).toContain("custo médio de R$ 11,00");
    expect(bens.find(b => b.ativo === "KNRI11")!.codigo).toContain("03 – Fundos de investimento imobiliário");
    expect(bens.find(b => b.ativo === "BTC")!.codigo).toBe("01 – Bitcoin");
  });

  test("rendimentos: proventos por tipo e lucro isento de ações", () => {
    const ops = [op("2026-01-02", "compra", "ITSA4", 1000, 10), op("2026-02-10", "venda", "ITSA4", 500, 12)];
    const r = rendimentosDoAno([
      { id: "1", data: "2026-03-01", ativo: "ITSA4", tipo: "dividendo", valor: 50 },
      { id: "2", data: "2026-04-01", ativo: "ITSA4", tipo: "jcp", valor: 85, irRetido: 15 },
      { id: "3", data: "2026-04-15", ativo: "KNRI11", tipo: "rendimento", valor: 9 },
      { id: "4", data: "2025-04-15", ativo: "KNRI11", tipo: "rendimento", valor: 9 },
    ], processar(ops).realizados, 2026);
    expect(r.dividendos).toEqual([{ ativo: "ITSA4", valor: 50 }]);
    expect(r.jcp).toEqual([{ ativo: "ITSA4", valor: 85, irRetido: 15 }]);
    expect(r.rendimentosFii).toEqual([{ ativo: "KNRI11", valor: 9 }]);
    expect(r.lucroIsentoAcoes).toBe(1000);
  });
});

describe("proventos sugeridos, rentabilidade e datas", () => {
  test("pagamento × quantidade na véspera da data-ex; não repete o que já foi lançado", () => {
    const ops = [op("2026-01-02", "compra", "ITSA4", 100, 10), op("2026-03-10", "compra", "ITSA4", 100, 10)];
    const hist = { ITSA4: [{ date: "2026-03-10", amount: 0.5 }, { date: "2026-04-10", amount: 0.5 }] };
    const sug = sugerirProventos(ops, hist, []);
    expect(sug.map(s => [s.data, s.valor])).toEqual([["2026-04-10", 100], ["2026-03-10", 50]]);
    expect(sugerirProventos(ops, hist, [{ id: "x", data: "2026-04-15", ativo: "ITSA4", tipo: "dividendo", valor: 100 }])).toHaveLength(1);
  });

  test("rentabilidade desconta aportes e retiradas", () => {
    // 1000 → rende 10% → 1100; aporte de 900 → 2000; rende 5% → 2100
    const r = rentabilidade(
      [{ data: "2026-01-01", valor: 1000 }, { data: "2026-01-02", valor: 1100 }, { data: "2026-01-03", valor: 2000 }, { data: "2026-01-04", valor: 2100 }],
      [{ data: "2026-01-03", valor: 900 }],
    );
    expect(r.total).toBeCloseTo((1.1 * 1.05 - 1) * 100);
  });

  test("dias de pregão e vencimento do DARF", () => {
    expect(ehDiaDePregao("2026-11-20")).toBe(false);
    expect(ehDiaDePregao("2026-02-17")).toBe(false); // Carnaval
    expect(ehDiaDePregao("2026-02-18")).toBe(true);
    expect(ultimoDiaUtil("2026-12")).toBe("2026-12-30");
    expect(ultimoDiaUtil("2026-05")).toBe("2026-05-29");
  });

  test("quantidades para a carteira", () => {
    expect(quantidadesDaCarteira([
      op("2026-01-02", "compra", "ITSA4", 100, 10), op("2026-01-03", "venda", "ITSA4", 40, 10),
      op("2026-01-02", "compra", "ETH", 0.5, 10_000, { classe: "cripto" }),
    ])).toEqual({ acoesFiis: { ITSA4: 60 }, cripto: { ETH: 0.5 } });
  });
});
