// Contas do orçamento: totais, renda de referência, meta × realizado, filtros e regras de descrição.
import { describe, expect, test } from "vitest";
import {
  FILTRO_PADRAO, aplicarRegra, avisosDeGasto, comprometidoDoMes, dataDaRegra, ehRecorrente, filtrar, filtroAtivo, gerarDoMes, idRecorrente, mesCurto,
  projetarRecorrentes, referencia, regraAtiva, regraPara, somaMeses, totais, valoresArea, type DocRecorrentes, type Mes, type RegraRecorrente,
} from "./orcamento";

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

const aluguel: RegraRecorrente = { id: "alug", kind: "expense", description: "Aluguel", amount: 2400, area: "fixedCosts", method: "bill", day: 5, start: "2026-09" };
const salario: RegraRecorrente = { id: "sal", kind: "income", description: "Salário", amount: 9800, day: 31, start: "2026-01", end: "2026-12" };
const doc = (rules: RegraRecorrente[], generated: Record<string, string[]> = {}): DocRecorrentes => ({ rules, generated });
const vazio: Mes = { incomes: [], expenses: [] };

describe("lançamentos recorrentes", () => {
  test("datas e vigência: mês curto usa o último dia; só vale entre início e fim", () => {
    expect(dataDaRegra(salario, "2026-02")).toBe("2026-02-28");
    expect(dataDaRegra(salario, "2026-04")).toBe("2026-04-30");
    expect(dataDaRegra(aluguel, "2026-11")).toBe("2026-11-05");
    expect(regraAtiva(aluguel, "2026-08")).toBe(false);
    expect(regraAtiva(salario, "2026-12")).toBe(true);
    expect(regraAtiva(salario, "2027-01")).toBe(false);
    expect(ehRecorrente(idRecorrente("alug", "2026-11"))).toBe(true);
    expect(ehRecorrente("abc123")).toBe(false);
  });

  test("abrir o mês cria os lançamentos que faltam, uma vez só", () => {
    const d = doc([aluguel, salario]);
    const r = gerarDoMes("2026-11", vazio, d, "2026-11-23");
    expect(r.criados).toBe(2);
    expect(r.mes.expenses).toEqual([{ id: "rec-alug-2026-11", date: "2026-11-05", description: "Aluguel", amount: 2400, method: "bill", area: "fixedCosts" }]);
    expect(r.mes.incomes[0]).toMatchObject({ id: "rec-sal-2026-11", date: "2026-11-30", amount: 9800 });
    expect(r.regras.sort()).toEqual(["alug", "sal"]);
    // de novo, com o que já foi gerado: nada muda
    const de_novo = gerarDoMes("2026-11", r.mes, doc([aluguel, salario], { "2026-11": r.regras }), "2026-11-23");
    expect(de_novo.criados).toBe(0);
    expect(de_novo.mes).toBe(r.mes);
  });

  test("lançamento apagado não volta; marcação perdida só registra se o lançamento já existe", () => {
    const apagado = gerarDoMes("2026-11", vazio, doc([aluguel], { "2026-11": ["alug"] }), "2026-11-23");
    expect(apagado.criados).toBe(0);
    expect(apagado.mes.expenses).toEqual([]);
    const jaExiste: Mes = { incomes: [], expenses: [{ id: "rec-alug-2026-11", date: "2026-11-05", description: "Aluguel", amount: 2500, area: "fixedCosts" }] };
    const r = gerarDoMes("2026-11", jaExiste, doc([aluguel]), "2026-11-23");
    expect(r.criados).toBe(0);
    expect(r.regras).toEqual(["alug"]);
    expect(r.mes.expenses[0].amount).toBe(2500); // não sobrescreve o valor que o usuário ajustou
  });

  test("mês futuro não é criado (é só previsto); meses antes do começo da regra também não", () => {
    expect(gerarDoMes("2026-12", vazio, doc([aluguel]), "2026-11-23").criados).toBe(0);
    expect(gerarDoMes("2026-08", vazio, doc([aluguel]), "2026-11-23").criados).toBe(0);
    expect(gerarDoMes("2026-10", vazio, doc([aluguel]), "2026-11-23").criados).toBe(1); // mês passado ainda não aberto
  });

  test("previsão dos próximos meses: parcelas, recorrentes lançados e previstos, sem contar duas vezes", () => {
    const d = doc([aluguel, salario]);
    const mes: Mes = {
      incomes: [],
      expenses: [
        { id: "p1", date: "2026-12-12", description: "Notebook", amount: 389.9, area: "comfort", installment: "4/12" },
        { id: "p2", date: "2026-12-18", description: "Geladeira", amount: 219, area: "fixedCosts", installment: "6/10" },
        { id: "x1", date: "2026-12-20", description: "Presente", amount: 100, area: "pleasures" },
      ],
    };
    expect(projetarRecorrentes(d, "2026-12", mes)).toEqual({ entradas: 9800, saidas: 2400 });
    expect(comprometidoDoMes("2026-12", mes, d)).toMatchObject({ parcelas: 608.9, qtdParcelas: 2, recorrentes: 2400, outros: 100, total: 3108.9, entradas: 9800 });
    // o aluguel já lançado no mês não entra de novo como previsto
    const comAluguel: Mes = { ...mes, expenses: [...mes.expenses, { id: "rec-alug-2026-12", date: "2026-12-05", description: "Aluguel", amount: 2400, area: "fixedCosts" }] };
    expect(comprometidoDoMes("2026-12", comAluguel, d)).toMatchObject({ recorrentes: 2400, total: 3108.9 });
  });
});

describe("avisos de gasto", () => {
  const metas = { targets: { fixedCosts: 50, comfort: 10, pleasures: 10, education: 5, financialFreedom: 25 } };
  const areasCom = (gastos: Partial<Record<string, number>>) => {
    const despesas = Object.entries(gastos).map(([area, amount], i) => ({ id: "e" + i, date: "2026-11-02", description: area, amount: amount!, area: area as never }));
    const mes: Mes = { incomes: [{ id: "i", date: "2026-11-01", description: "Salário", amount: 10_000 }], expenses: despesas };
    const t = totais(mes), ref = referencia(t, metas, [], "2026-11");
    return { areas: valoresArea(t, ref, metas), ref };
  };

  test("passou da meta, já usou 80% e ritmo acima da meta, do mais grave para o menos", () => {
    const { areas, ref } = areasCom({ comfort: 1200, pleasures: 850, education: 390 }); // metas: 1000, 1000 e 500
    const avisos = avisosDeGasto(areas, ref, "2026-11-23", "2026-11");
    expect(avisos.map(a => [a.area, a.nivel])).toEqual([["comfort", "estourou"], ["pleasures", "quase"], ["education", "ritmo"]]);
    expect(avisos[0].texto).toContain("R$ 200,00 acima");
    expect(avisos[0].texto).toContain("faltam 7 dias");
    expect(avisos[1].texto).toContain("85% da meta");
    expect(avisos[2].texto).toContain("projeção de R$ 508,70");
  });

  test("custos fixos não geram aviso de ritmo, mas estourar vale; só no mês atual e com renda", () => {
    const { areas, ref } = areasCom({ fixedCosts: 2500 }); // metade da meta no dia 10: ritmo seria alto, mas é custo fixo
    expect(avisosDeGasto(areas, ref, "2026-11-10", "2026-11")).toEqual([]);
    const estourou = areasCom({ fixedCosts: 5200 });
    expect(avisosDeGasto(estourou.areas, estourou.ref, "2026-11-10", "2026-11")[0]).toMatchObject({ area: "fixedCosts", nivel: "estourou" });
    expect(avisosDeGasto(estourou.areas, estourou.ref, "2026-12-01", "2026-11")).toEqual([]); // mês que já passou
    const semRenda = areasCom({});
    expect(avisosDeGasto(semRenda.areas, { income: 0, source: null }, "2026-11-10", "2026-11")).toEqual([]);
  });

  test("ritmo só depois do quinto dia e com gasto", () => {
    const { areas, ref } = areasCom({ pleasures: 400 });
    expect(avisosDeGasto(areas, ref, "2026-11-04", "2026-11")).toEqual([]);
    expect(avisosDeGasto(areas, ref, "2026-11-10", "2026-11")[0]).toMatchObject({ area: "pleasures", nivel: "ritmo" }); // 400 em 10 dias = 1.200 no mês
  });
});
