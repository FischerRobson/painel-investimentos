// Renda fixa da carteira: valor na curva (rfCalc), premissas atuais e projeção (projectOne).
import { describe, expect, test } from "vitest";
import { currentRates, projectOne, rfCalc, weekdays, type TaxasBCB, type TituloRF } from "./motor";

// 10 dias úteis de CDI a 0,05% ao dia (de 2026-01-05, segunda, a 2026-01-16) e IPCA de 0,5% ao mês em 2026
const dias = ["05", "06", "07", "08", "09", "12", "13", "14", "15", "16"].map(d => `2026-01-${d}`);
const rates: TaxasBCB = {
  cdi: dias.map(d => [d, 0.05] as [string, number]),
  ipca: Array.from({ length: 12 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}-01`, 0.5] as [string, number]),
};
const titulo = (t: Partial<TituloRF>): TituloRF => ({ id: "x", nome: "X", tipo: "CDB", idx: "cdi", taxa: 100, aplicado: 1000, data: "2026-01-05", venc: "2030-01-01", ...t });
const perto = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("rfCalc", () => {
  test("CDI: acumula o % do CDI de cada dia útil até hoje (exclusive)", () => {
    const r = rfCalc(titulo({ taxa: 100 }), rates, "2026-01-12");
    perto(r.bruto, 1000 * Math.pow(1.0005, 5)); // 05 a 09
    expect(r.aliq).toBe(0.225);
    perto(r.ir, (r.bruto - 1000) * 0.225);
    expect(r.venceu).toBe(false);
  });

  test("CDI a 110% e título isento (LCI)", () => {
    const r = rfCalc(titulo({ taxa: 110, isento: true }), rates, "2026-01-17");
    perto(r.bruto, 1000 * Math.pow(1 + 0.0005 * 1.1, 10));
    expect(r.ir).toBe(0);
    expect(r.aliq).toBe(0);
    perto(r.liquido, r.bruto);
  });

  test("prefixado: taxa anual elevada a dias úteis ÷ 252", () => {
    const r = rfCalc(titulo({ idx: "pre", taxa: 12 }), rates, "2026-01-17");
    perto(r.bruto, 1000 * Math.pow(1.12, 10 / 252));
  });

  test("IPCA+: IPCA dos meses completos depois da aplicação", () => {
    // aplicado em janeiro, hoje em abril: entram fevereiro e março
    const r = rfCalc(titulo({ idx: "ipca", taxa: 6 }), rates, "2026-04-10");
    perto(r.bruto, 1000 * 1.005 * 1.005 * Math.pow(1.06, 10 / 252));
  });

  test("título vencido para de render no vencimento", () => {
    const r = rfCalc(titulo({ venc: "2026-01-09" }), rates, "2026-06-01");
    perto(r.bruto, 1000 * Math.pow(1.0005, 4)); // 05 a 08
    expect(r.venceu).toBe(true);
  });
});

test("currentRates: CDI do último dia anualizado em 252 e IPCA de 12 meses", () => {
  const c = currentRates(rates);
  perto(c.cdi, (Math.pow(1.0005, 252) - 1) * 100);
  perto(c.ipca, (Math.pow(1.005, 12) - 1) * 100);
});

test("dias úteis: segunda a sexta, de a (inclusive) até b (exclusive)", () => {
  expect(weekdays("2026-01-05", "2026-01-12")).toBe(5);
  expect(weekdays("2026-01-10", "2026-01-12")).toBe(0); // sábado e domingo
  expect(weekdays("2026-01-12", "2026-01-05")).toBe(0);
});

describe("projectOne", () => {
  const hoje = "2026-01-17"; // sábado, depois dos 10 dias de CDI
  const cfg = { cdi: 14, ipca: 5, reinvest: true };

  test("prefixado sem vencer antes: valor de hoje × (1 + taxa)^(du ÷ 252), IR pelo prazo desde a aplicação", () => {
    const e = titulo({ idx: "pre", taxa: 12, venc: "2030-01-01" });
    const p = projectOne(e, "2027-01-15", cfg, rates, hoje);
    const hojeBruto = rfCalc(e, rates, hoje).bruto;
    perto(p.bruto, hojeBruto * Math.pow(1.12, weekdays(hoje, "2027-01-15") / 252), 1e-6);
    perto(p.ir, (p.bruto - 1000) * 0.175, 1e-6); // 375 dias desde a aplicação
    expect(p.venceAntes).toBe(false);
  });

  test("vence antes da data: reaplica o líquido a 100% do CDI e soma o IR das duas etapas", () => {
    const e = titulo({ idx: "pre", taxa: 12, venc: "2026-07-01" });
    const sem = projectOne(e, "2027-01-15", { ...cfg, reinvest: false }, rates, hoje);
    const com = projectOne(e, "2027-01-15", cfg, rates, hoje);
    expect(sem.venceAntes).toBe(true);
    expect(sem.end).toBe("2026-07-01");
    expect(com.liquido).toBeGreaterThan(sem.liquido);
    expect(com.ir).toBeGreaterThan(sem.ir);
  });

  test("título já vencido fica com o valor do vencimento", () => {
    const e = titulo({ venc: "2026-01-09" });
    const p = projectOne(e, "2027-01-15", { ...cfg, reinvest: false }, rates, hoje);
    perto(p.liquido, rfCalc(e, rates, hoje).liquido);
  });
});
