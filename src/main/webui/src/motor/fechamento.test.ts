import { describe, expect, it } from "vitest";
import { contribuicoes, investidoNoMes, janelaDoMes, pontePatrimonio, poupancaDoMes, type FotoMes } from "./fechamento";
import type { Operacao, Provento } from "./operacoes";

const foto = (i: number, data: string): FotoMes => ({ i, takenAt: `${data}T21:00:00Z` });
const fotos = Object.fromEntries([["2026-09-30", 100_000], ["2026-10-15", 108_000], ["2026-10-30", 112_000], ["2026-11-03", 115_000]]
  .map(([d, v]) => [d as string, foto(v as number, d as string)]));
const op = (id: string, data: string, tipo: Operacao["tipo"], valor: number, extra: Partial<Operacao> = {}): Operacao =>
  ({ id, data, tipo, classe: "acao", ativo: "AAAA3", qtd: 1, preco: valor, valor, registrado: `${data}T15:00:00Z`, ...extra });
const ops = [op("antes", "2026-09-30", "compra", 999), op("c", "2026-10-10", "compra", 9000), op("v", "2026-10-20", "venda", 2000), op("depois", "2026-11-02", "compra", 500)];
const proventos: Provento[] = [{ id: "p", data: "2026-10-14", ativo: "AAAA3", tipo: "dividendo", valor: 600 }, { id: "q", data: "2026-11-01", ativo: "AAAA3", tipo: "dividendo", valor: 50 }];

describe("janelaDoMes", () => {
  const datas = Object.keys(fotos);
  it("vai da última foto antes do mês até a última do mês", () => {
    expect(janelaDoMes(datas, "2026-10")).toEqual({ inicio: "2026-09-30", fim: "2026-10-30", datas: ["2026-09-30", "2026-10-15", "2026-10-30"], comecaNoMes: false });
  });
  it("sem foto anterior começa na primeira do mês; com uma foto só não há janela", () => {
    expect(janelaDoMes(["2026-10-15", "2026-10-30"], "2026-10")).toMatchObject({ inicio: "2026-10-15", comecaNoMes: true });
    expect(janelaDoMes(["2026-10-15"], "2026-10")).toBeNull();
    expect(janelaDoMes(datas, "2026-08")).toBeNull();
  });
});

describe("pontePatrimonio", () => {
  const p = pontePatrimonio({ fotos, mes: "2026-10", operacoes: ops, proventos })!;
  it("separa aportes, retiradas, proventos e valorização, e a conta fecha", () => {
    expect(p).toMatchObject({ valorInicio: 100_000, valorFim: 112_000, aportes: 9000, retiradas: 2000, proventos: 600, valorizacao: 5000, rendimento: 5600 });
    expect(p.valorInicio + p.aportes - p.retiradas + p.valorizacao).toBeCloseTo(p.valorFim);
  });
  it("a rentabilidade não conta o aporte como ganho", () => {
    // 1º trecho: (108000 − 9000 + 600) / 100000; 2º: (112000 + 2000) / 108000
    expect(p.twr!).toBeCloseTo(((99_600 / 100_000) * (114_000 / 108_000) - 1) * 100);
    expect(p.alertas).toEqual([]);
  });
  it("sem operações não separa nem calcula rentabilidade", () => {
    expect(pontePatrimonio({ fotos, mes: "2026-10", operacoes: [], proventos: [] })).toMatchObject({ separavel: false, twr: null });
  });
  it("avisa quando um lançamento atrasado distorce o rendimento", () => {
    const atrasadas = [
      op("i", "2026-10-05", "compra", 100, { inicial: true, ativo: "INIC3", registrado: "2026-10-06T12:00:00Z" }),
      op("r", "2026-09-10", "compra", 100, { ativo: "RETR3", registrado: "2026-10-06T12:00:00Z" }),
      op("t", "2026-10-29", "compra", 100, { ativo: "TARD3", registrado: "2026-11-10T12:00:00Z" }),
    ];
    const a = pontePatrimonio({ fotos, mes: "2026-10", operacoes: atrasadas, proventos: [] })!.alertas.join(" | ");
    expect(a).toContain("Saldo inicial lançado neste período (INIC3)");
    expect(a).toContain("RETR3");
    expect(a).toContain("TARD3");
  });
  it("avisa quando a foto do começo ou do fim usou cotação antiga", () => {
    const comFalha = { ...fotos, "2026-10-30": { ...fotos["2026-10-30"], stale: [{ asset: "BTC" }] } };
    expect(pontePatrimonio({ fotos: comFalha, mes: "2026-10", operacoes: ops, proventos })!.alertas[0]).toContain("30/10/2026 faltou a cotação de BTC");
  });
});

describe("contribuicoes", () => {
  it("soma o PnL dos dias e separa altas e baixas", () => {
    const dia = (date: string, a: number | null, b: number) => ({ date, positions: [{ key: "a", asset: "A", pnl: a }, { key: "b", asset: "B", pnl: b }] });
    const r = contribuicoes([dia("1", 100, -30), dia("2", null, -50), dia("3", 20, 10)]);
    expect(r.altas).toEqual([{ key: "a", ativo: "A", pnl: 120 }]);
    expect(r.baixas).toEqual([{ key: "b", ativo: "B", pnl: -70 }]);
  });
});

describe("poupancaDoMes", () => {
  const m = (month: string, income: number, expenses: number, comfort: number) => ({ month, income, expenses, areas: { comfort, fixedCosts: expenses - comfort } });
  const resumos = [m("2026-07", 10_000, 6000, 1000), m("2026-08", 10_000, 7000, 1000), m("2026-09", 0, 0, 0), m("2026-10", 10_000, 8000, 2000)];
  it("taxa do mês contra a média ponderada dos meses com movimento", () => {
    const p = poupancaDoMes(resumos, "2026-10");
    expect(p).toMatchObject({ renda: 10_000, sobra: 2000, taxa: 20 });
    expect(p.comparacao).toEqual({ meses: 2, despesas: 6500, taxa: 35 });
    expect(p.serie.map(s => s.mes)).toEqual(["2026-07", "2026-08", "2026-10"]);
  });
  it("marca só a área bem acima da média", () => {
    const p = poupancaDoMes(resumos, "2026-10");
    expect(p.areas.find(a => a.area === "comfort")).toMatchObject({ gasto: 2000, media: 1000, acima: true });
    expect(p.areas.find(a => a.area === "fixedCosts")!.acima).toBe(false); // 6000 contra 5500: menos de 20%
  });
  it("sem renda não há taxa, e com um mês só de comparação nada é marcado", () => {
    expect(poupancaDoMes([m("2026-10", 0, 500, 500)], "2026-10")).toMatchObject({ taxa: null, comparacao: null });
    expect(poupancaDoMes([m("2026-09", 1000, 100, 100), m("2026-10", 1000, 900, 900)], "2026-10").areas.some(a => a.acima)).toBe(false);
  });
});

describe("investidoNoMes", () => {
  it("usa o mês do calendário e desconta vendas", () => expect(investidoNoMes(ops, "2026-10")).toBe(7000));
});
