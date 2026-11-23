// VR como conta: saldo, extrato, resumo mensal, crédito pendente e ritmo do mês
import { describe, expect, test } from "vitest";
import { ajusteParaSaldo, creditoPendente, extrato, proximoCredito, resumoMensal, ritmoDoMes, saldo, type ContaVR, type MovimentoVR } from "./vr";

const conta: ContaVR = { id: "vr", nome: "VR", creditoMensal: 1000, diaCredito: 1, saldoInicial: 200, dataInicio: "2026-09-30" };
let n = 0;
const mv = (data: string, tipo: MovimentoVR["tipo"], valor: number): MovimentoVR => ({ id: String(++n).padStart(3, "0"), conta: "vr", data, tipo, valor });
const ms: MovimentoVR[] = [
  mv("2026-10-01", "credito", 1000), mv("2026-10-05", "gasto", 50), mv("2026-10-20", "gasto", 700), mv("2026-10-21", "estorno", 30),
  mv("2026-11-01", "credito", 1000), mv("2026-11-10", "gasto", 400), mv("2026-11-12", "ajuste", -5.5),
  { id: "x", conta: "outra", data: "2026-11-10", tipo: "gasto", valor: 999 },
];

describe("VR", () => {
  test("saldo = inicial + créditos e estornos − gastos ± ajustes, só da conta", () => {
    expect(saldo(conta, ms)).toBeCloseTo(200 + 1000 - 50 - 700 + 30 + 1000 - 400 - 5.5);
    expect(saldo(conta, ms, "2026-10-31")).toBeCloseTo(480);
  });

  test("extrato do mês com o saldo depois de cada lançamento", () => {
    const e = extrato(conta, ms, "2026-11");
    expect(e.inicial).toBeCloseTo(480);
    expect(e.linhas.map(l => l.saldo)).toEqual([1480, 1080, 1074.5]);
    expect(e.final).toBeCloseTo(1074.5);
  });

  test("resumo mês a mês, com o saldo acumulado", () => {
    const r = resumoMensal(conta, ms, "2026-11");
    expect(r.map(x => x.mes)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(r[1]).toMatchObject({ creditos: 1000, gastos: 750, estornos: 30, saldo: 480 });
    expect(r[2].saldo).toBeCloseTo(1074.5);
  });

  test("crédito pendente: o dia já passou e o crédito do mês não foi lançado", () => {
    expect(creditoPendente(conta, ms, "2026-11-23")).toBeNull();
    expect(creditoPendente(conta, ms, "2026-12-02")).toBe("2026-12-01");
    expect(creditoPendente({ ...conta, diaCredito: 31 }, [], "2027-02-28")).toBe("2027-02-28"); // mês mais curto
    expect(proximoCredito(conta, "2026-11-23")).toBe("2026-12-01");
  });

  test("ritmo do mês: quanto sobra do crédito e quanto dá por dia até o próximo", () => {
    const r = ritmoDoMes(conta, ms, "2026-11-23");
    expect(r).toMatchObject({ entrou: 1000, gastou: 400, sobra: 600, proximo: "2026-12-01", dias: 8 });
    expect(r.porDia).toBeCloseTo(75);
  });

  test("ajuste para bater com o app", () => {
    expect(ajusteParaSaldo(1074.5, 1070)).toBe(-4.5);
  });
});
