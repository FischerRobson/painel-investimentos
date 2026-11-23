// Contas do orçamento: totais, renda de referência, meta × realizado, filtros e regras de descrição.
import { describe, expect, test } from "vitest";
import { FILTRO_PADRAO, aplicarRegra, filtrar, filtroAtivo, mesCurto, referencia, regraPara, somaMeses, totais, valoresArea, type Mes } from "./orcamento";

const mes: Mes = {
  incomes: [{ id: "i1", date: "2026-03-05", description: "Salário", amount: 10_000 }],
  expenses: [
    { id: "e1", date: "2026-03-02", description: "Aluguel", amount: 3000, area: "fixedCosts", method: "bill" },
    { id: "e2", date: "2026-03-10", description: "AUTO POSTO MAJOR 123", amount: 250, area: "comfort", method: "creditCard" },
    { id: "e3", date: "2026-03-10", description: "Curso de inglês", amount: 400, area: "education" },
  ],
};
const metas = { targets: { fixedCosts: 50, comfort: 10, pleasures: 10, education: 5, financialFreedom: 25 } };

describe("orçamento", () => {
  test("meses", () => {
    expect(somaMeses("2026-01", -1)).toBe("2025-12");
    expect(somaMeses("2026-12", 1)).toBe("2027-01");
    expect(mesCurto("2026-03")).toBe("mar/26");
  });

  test("totais e meta × realizado; liberdade financeira = sobra do mês", () => {
    const t = totais(mes);
    expect(t).toMatchObject({ income: 10_000, expenses: 3650 });
    const ref = referencia(t, metas, [], "2026-03");
    expect(ref).toEqual({ income: 10_000, source: "month" });
    const v = Object.fromEntries(valoresArea(t, ref, metas).map(x => [x.area.id, x]));
    expect(v.fixedCosts).toMatchObject({ goal: 5000, spent: 3000 });
    expect(v.financialFreedom).toMatchObject({ goal: 2500, spent: 6350 });
  });

  test("renda de referência: a salva; senão a do último mês anterior com entradas", () => {
    const vazio = totais({ incomes: [], expenses: [] });
    expect(referencia(vazio, { ...metas, referenceIncome: 8000 }, [], "2026-03")).toEqual({ income: 8000, source: "setting" });
    const resumo = [{ month: "2026-01", income: 7000, expenses: 1 }, { month: "2026-02", income: 0, expenses: 1 }, { month: "2026-04", income: 9000, expenses: 1 }];
    expect(referencia(vazio, metas, resumo, "2026-03")).toEqual({ income: 7000, source: "history", month: "2026-01" });
    expect(referencia(vazio, metas, [], "2026-03").source).toBeNull();
  });

  test("filtros: área esconde entradas; busca sem acento; ordem por valor", () => {
    expect(filtrar(mes, FILTRO_PADRAO).map(x => x.id)).toEqual(["e2", "e3", "i1", "e1"]); // data desc, empate por descrição
    expect(filtrar(mes, { ...FILTRO_PADRAO, area: "education" }).map(x => x.id)).toEqual(["e3"]);
    expect(filtrar(mes, { ...FILTRO_PADRAO, q: "INGLES" }).map(x => x.id)).toEqual(["e3"]);
    expect(filtrar(mes, { ...FILTRO_PADRAO, sort: "amount-asc", kind: "expense" }).map(x => x.id)).toEqual(["e2", "e3", "e1"]);
    expect(filtroAtivo(FILTRO_PADRAO)).toBe(false);
    expect(filtroAtivo({ ...FILTRO_PADRAO, sort: "amount-asc" })).toBe(false);
    expect(filtroAtivo({ ...FILTRO_PADRAO, method: "pix" })).toBe(true);
  });

  test("regras: a mais específica vence; aplicar renomeia e troca a área", () => {
    const regras = [{ id: "a", match: "posto", description: "Posto" }, { id: "b", match: "Auto Posto Major", description: "Combustível", area: "fixedCosts" as const }];
    expect(regraPara("auto posto major 123", regras)?.id).toBe("b");
    expect(regraPara("mercado", regras)).toBeNull();
    const { mes: novo, changed } = aplicarRegra(mes, regras[1]);
    expect(changed).toBe(1);
    expect(novo.expenses[1]).toMatchObject({ description: "Combustível", area: "fixedCosts" });
    expect(aplicarRegra(novo, regras[1]).changed).toBe(0);
  });
});
