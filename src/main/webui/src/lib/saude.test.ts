import { describe, expect, it } from "vitest";
import type { Fundamentos } from "../motor";
import { montarComposicao, type ItemAtivo } from "./composicao";
import { calcularSaude, PREF_SAUDE, type ItemFund } from "./saude";
import type { DocCarteira } from "./carteira";

const hoje = "2026-11-23";
const cdi: [string, number][] = [];
for (let d = new Date("2024-01-01T12:00:00"); d <= new Date(hoje + "T12:00:00"); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) cdi.push([d.toLocaleDateString("sv-SE"), 0.04]);
const rates = { cdi, ipca: [] as [string, number][] };

const doc: DocCarteira = {
  acoesFiis: [{ t: "FRACO3", q: 100 }, { t: "FORTE3", q: 10 }],
  rendaFixa: [{ id: "s", nome: "Tesouro Selic 2029", tipo: "Tesouro Selic", idx: "cdi", taxa: 100, aplicado: 6000, data: "2025-06-02", venc: "2029-03-01", liquidezDiaria: true }],
  operacoes: [
    { id: "1", data: "2024-02-01", tipo: "compra", classe: "acao", ativo: "FRACO3", qtd: 100, preco: 10 },
    { id: "2", data: "2024-02-01", tipo: "compra", classe: "acao", ativo: "FORTE3", qtd: 10, preco: 10 },
  ],
};
const item = (ticker: string, price: number, fund: Fundamentos): ItemAtivo & ItemFund => ({ ticker, price, currency: "BRL", type: "Ação", sector: "Energia", fund });
const itens = {
  FRACO3: item("FRACO3", 10.5, { pl: -3, pvp: 3.5, roe: 0.01, dy: 0.01 }),
  FORTE3: item("FORTE3", 12, { pl: 7, pvp: 1.1, evEbitda: 5, roe: 0.22, roic: 0.16, margemLiq: 0.2, divLiqPatrim: 0, crescRec5a: 0.15, dy: 0.09, liquidez: 5e6 }),
};

function roda(aporte = "") {
  const comp = montarComposicao({ doc, ativos: itens, cripto: {}, fx: null, rates, hoje, valorBem: () => null });
  return calcularSaude({ comp, itens, rates, hoje, custoFixo: 2000, prefs: { ...PREF_SAUDE, aporte }, operacoes: doc.operacoes ?? [], proventos: [] });
}

describe("calcularSaude", () => {
  it("nota cada ativo, mede a reserva e aponta o ativo fraco", () => {
    const s = roda();
    const fraco = s.ativos.find(a => a.ticker === "FRACO3")!, forte = s.ativos.find(a => a.ticker === "FORTE3")!;
    expect(fraco.nota!).toBeLessThan(40);
    expect(forte.nota!).toBeGreaterThan(70);
    expect(s.reserva.liquidez).toBeGreaterThan(6000);
    expect(s.reserva.atual!).toBeGreaterThan(3);
    expect(s.sinais.some(x => x.ativo === "FRACO3")).toBe(true);
    expect(s.sinais.some(x => x.ativo === "FORTE3" && x.severidade === "alta")).toBe(false);
    expect(s.geral).not.toBeNull();
    expect(s.registro.ativos.FORTE3).toBe(forte.nota);
  });
  it("sugere trocar o fraco pelo forte do mesmo setor, com o IR da venda", () => {
    const s = roda();
    const t = s.trocas.find(x => x.de === "FRACO3");
    expect(t?.para).toBe("FORTE3");
    expect(t!.custo.ir === 0 || t!.custo.isento || t!.custo.prejuizo).toBe(true); // 100 × 10,50 = R$ 1.050 de ganho pequeno, dentro da isenção
  });
  it("divide o aporte e só compra ativo que passa nos filtros", () => {
    const s = roda("10000");
    expect(s.aporte!.partes.reduce((a, p) => a + p.valor, 0)).toBeCloseTo(10000);
    const compras = s.aporte!.compras.acao ?? [];
    expect(compras.every(c => c.ticker !== "FRACO3")).toBe(true);
  });
});
