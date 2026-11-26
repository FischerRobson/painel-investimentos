import { describe, expect, it } from "vitest";
import { impostoDasVendas, planejarRebalanceamento, type Vendavel } from "./rebalancear";
import type { Operacao } from "./operacoes";
import type { ClasseMeta } from "./saude";

const hoje = "2026-11-26";
const compra = (ativo: string, classe: "acao" | "fii", qtd: number, preco: number): Operacao =>
  ({ id: ativo, data: "2025-01-10", tipo: "compra", classe, ativo, qtd, preco });
const ativo = (id: string, classe: ClasseMeta, valor: number, extra: Partial<Vendavel> = {}): Vendavel => ({
  id, nome: id, classe, valor, nota: null, unidades: classe === "rf" ? null : 100, fracionavel: false,
  classeIR: classe === "rf" ? null : classe === "fii" ? "fii" : "acao", custo: classe === "rf" ? null : valor / 2,
  irRetido: 0, reserva: false, bloqueio: null, aviso: null, ...extra,
});
const valores = (v: Partial<Record<ClasseMeta, number>>) => ({ rf: 0, acao: 0, fii: 0, exterior: 0, cripto: 0, ...v });
const metas = valores({ rf: 50, acao: 50 });

describe("impostoDasVendas", () => {
  const ops = [compra("AAAA3", "acao", 1000, 20), compra("BBBB11", "fii", 100, 100)];
  const venda = (qtd: number) => [{ ativo: "AAAA3", classe: "acao" as const, qtd, valor: qtd * 40 }];
  it("ações até R$ 20 mil no mês são isentas; acima, 15% sobre todo o lucro", () => {
    expect(impostoDasVendas(ops, venda(500), hoje)).toBe(0);
    expect(impostoDasVendas(ops, venda(600), hoje)).toBeCloseTo(600 * 20 * 0.15);
  });
  it("soma o que já foi vendido no mês", () => {
    const antes: Operacao = { id: "v", data: "2026-11-02", tipo: "venda", classe: "acao", ativo: "AAAA3", qtd: 400, preco: 40 };
    // com os 400 já vendidos (isentos), mais 200 passam de R$ 20 mil e os 600 passam a ser tributados
    expect(impostoDasVendas([...ops, antes], venda(200), hoje)).toBeCloseTo(600 * 20 * 0.15);
  });
  it("FII paga 20% sem isenção", () => {
    expect(impostoDasVendas(ops, [{ ativo: "BBBB11", classe: "fii", qtd: 10, valor: 1500 }], hoje)).toBeCloseTo(100);
  });
});

describe("planejarRebalanceamento", () => {
  const acoes = [ativo("BOA3", "acao", 40_000, { nota: 80, unidades: 1000 }), ativo("FRACA3", "acao", 40_000, { nota: 30, unidades: 1000 })];
  const ops = [compra("BOA3", "acao", 1000, 20), compra("FRACA3", "acao", 1000, 20)];
  const roda = (extra: Partial<Parameters<typeof planejarRebalanceamento>[0]> = {}) => planejarRebalanceamento({
    ativos: [...acoes, ativo("Selic", "rf", 20_000)], valores: valores({ rf: 20_000, acao: 80_000 }), metas, operacoes: ops, hoje, ...extra,
  });

  it("vende o excesso começando pela menor nota, desconta o IR e compra o que falta", () => {
    const p = roda();
    expect(p.vendas).toHaveLength(1);
    expect(p.vendas[0]).toMatchObject({ id: "FRACA3", qtd: 750, total: false });
    expect(p.vendido).toBeCloseTo(30_000);
    expect(p.vendas[0].lucro).toBeCloseTo(15_000);
    expect(p.impostoAPagar).toBeCloseTo(15_000 * 0.15);
    expect(p.avisoIsencao).toContain("R$ 20 mil");
    expect(p.compras.find(c => c.classe === "rf")!.valor).toBeCloseTo(30_000 - 2250);
    expect(p.compras.find(c => c.classe === "acao")!.valor).toBe(0);
    expect(p.depois.total).toBeCloseTo(100_000 - 2250);
    expect(p.aporteSemVender).toBeCloseTo(60_000);
  });
  it("dentro da tolerância não vende nada", () => {
    const p = roda({ valores: valores({ rf: 46_000, acao: 54_000 }) });
    expect(p.vendas).toEqual([]);
    expect(p.impostoAPagar).toBe(0);
  });
  it("aporte grande o bastante dispensa a venda", () => {
    const p = roda({ aporte: 60_000 });
    expect(p.vendas).toEqual([]);
    expect(p.compras.find(c => c.classe === "rf")!.valor).toBeCloseTo(60_000);
    expect(p.depois.linhas.find(l => l.classe === "rf")!.pct).toBeCloseTo(50);
  });
  it("não vende título sem liquidez nem a reserva de emergência", () => {
    const p = roda({
      ativos: [ativo("CDB", "rf", 50_000, { bloqueio: "sem liquidez diária" }), ativo("Selic", "rf", 30_000, { reserva: true, irRetido: 300 })],
      valores: valores({ rf: 80_000, acao: 20_000 }), reservaAlvo: 20_000,
    });
    expect(p.vendas).toHaveLength(1);
    expect(p.vendas[0]).toMatchObject({ id: "Selic", valor: 10_000, qtd: null });
    expect(p.irRetido).toBeCloseTo(100);
    expect(p.impostoAPagar).toBe(0); // o IR da renda fixa já está descontado do valor
    expect(p.naoVendido[0].valor).toBeCloseTo(20_000);
    expect(p.naoVendido[0].motivo).toContain("liquidez");
    expect(p.naoVendido[0].motivo).toContain("reserva");
  });
  it("ativo sem operações vai por último e fica marcado com IR desconhecido", () => {
    const p = roda({ ativos: [ativo("SEM3", "acao", 40_000, { custo: null, nota: 10 }), ativo("FRACA3", "acao", 40_000, { unidades: 1000, nota: 90 })] });
    expect(p.vendas.map(v => v.id)).toEqual(["FRACA3"]);
    const so = roda({ ativos: [ativo("SEM3", "acao", 80_000, { custo: null })] });
    expect(so.semIR).toEqual(["SEM3"]);
    expect(so.impostoAPagar).toBe(0);
  });
});
