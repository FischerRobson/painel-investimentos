// A carteira sai das operações: quantidades, títulos de renda fixa e moedas; estorno no lugar de apagar
import { describe, expect, test } from "vitest";
import { aplicacoesDosTitulosAntigos, comOperacoes, completar } from "./operacoes";
import { estorno, type Operacao, type TituloRF } from "../motor";

const compra = (ativo: string, qtd: number, classe: Operacao["classe"] = "acao"): Operacao =>
  ({ id: ativo + qtd, data: "2026-01-05", tipo: "compra", classe, ativo, qtd, preco: 10 });

describe("comOperacoes", () => {
  test("ativos com operações ganham a quantidade delas; os outros ficam como estão, na mesma ordem", () => {
    const doc = comOperacoes({ acoesFiis: [{ t: "WEGE3", q: 50 }, { t: "ITSA4", q: 1 }], cripto: [] },
      [compra("ITSA4", 100), compra("KNRI11", 10, "fii"), compra("BTC", 0.5, "cripto")]);
    expect(doc.acoesFiis).toEqual([{ t: "WEGE3", q: 50 }, { t: "ITSA4", q: 100 }, { t: "KNRI11", q: 10 }]);
    expect(doc.cripto).toEqual([{ t: "BTC", q: 0.5 }]);
    expect(doc.operacoes).toHaveLength(3);
  });

  test("vendeu tudo, ou estornou todas as operações do ativo: ele sai da carteira", () => {
    const antes = comOperacoes({ acoesFiis: [] }, [compra("ITSA4", 100)]);
    const vendeu = comOperacoes(antes, [...antes.operacoes!, { id: "v", data: "2026-02-01", tipo: "venda", classe: "acao", ativo: "ITSA4", qtd: 100, preco: 11 }]);
    expect(vendeu.acoesFiis).toEqual([]);
    const estornou = comOperacoes(antes, [...antes.operacoes!, estorno(antes.operacoes![0], { id: "e", data: "2026-02-01", motivo: "lancei errado" })]);
    expect(estornou.acoesFiis).toEqual([]);
    expect(estornou.operacoes).toHaveLength(2);
    expect(estornou.operacoes![1]).toMatchObject({ tipo: "estorno", estorna: "ITSA4100", obs: "lancei errado" });
  });

  test("renda fixa: a aplicação abre o título, o resgate parcial tira principal e o total tira o título", () => {
    const aplica: Operacao = { id: "a", data: "2026-01-05", tipo: "aplicacao", classe: "rf", ativo: "cdb1", qtd: 10_000, valor: 10_000, valorPresente: 0,
      titulo: { nome: "CDB X", tipo: "CDB", idx: "cdi", taxa: 110, venc: "2028-01-05", isento: false, instituicao: "Banco X", liquidezDiaria: true } };
    const d1 = comOperacoes({ rendaFixa: [] }, [aplica]);
    expect(d1.rendaFixa).toEqual([{ id: "cdb1", nome: "CDB X", tipo: "CDB", idx: "cdi", taxa: 110, venc: "2028-01-05", isento: false,
      instituicao: "Banco X", liquidezDiaria: true, aplicado: 10_000, data: "2026-01-05" }]);
    const parcial: Operacao = { id: "r1", data: "2026-06-01", tipo: "resgate", classe: "rf", ativo: "cdb1", qtd: 2_500, valor: 2_700, valorPresente: 10_800 };
    const d2 = comOperacoes(d1, [aplica, parcial]);
    expect((d2.rendaFixa as TituloRF[])[0].aplicado).toBe(7_500);
    const resto: Operacao = { id: "r2", data: "2026-07-01", tipo: "resgate", classe: "rf", ativo: "cdb1", qtd: 7_500, valor: 8_200, valorPresente: 8_200 };
    expect(comOperacoes(d2, [aplica, parcial, resto]).rendaFixa).toEqual([]);
    // estornar o resgate parcial devolve o principal
    expect((comOperacoes(d2, [aplica, parcial, estorno(parcial, { id: "e", data: "2026-06-02" })]).rendaFixa as TituloRF[])[0].aplicado).toBe(10_000);
  });

  test("moedas: compra soma e venda tira; moeda sem operações fica como estava", () => {
    const doc = comOperacoes({ moedas: [{ c: "EUR", q: 200 }] }, [
      { id: "m1", data: "2026-01-05", tipo: "compra", classe: "moeda", ativo: "USD", qtd: 500, valor: 2_750 },
      { id: "m2", data: "2026-02-05", tipo: "venda", classe: "moeda", ativo: "USD", qtd: 120, valor: 690 },
    ]);
    expect(doc.moedas).toEqual([{ c: "EUR", q: 200 }, { c: "USD", q: 380 }]);
  });

  test("compra e venda guardam o valor em reais e o valor presente da posição logo antes", () => {
    const c1 = completar({ id: "1", data: "2026-01-05", tipo: "compra", classe: "acao", ativo: "ITSA4", qtd: 100, preco: 10, taxas: 1.5 }, []);
    expect(c1).toMatchObject({ valor: 1001.5, valorPresente: 0 });
    const v = completar({ id: "2", data: "2026-03-01", tipo: "venda", classe: "acao", ativo: "ITSA4", qtd: 40, preco: 12, taxas: 1 }, [c1]);
    expect(v).toMatchObject({ valor: 479, valorPresente: 1200 }); // 100 ações a R$ 12
    const usd = completar({ id: "3", data: "2026-03-01", tipo: "compra", classe: "moeda", ativo: "USD", qtd: 100, valor: 560 },
      [{ id: "0", data: "2026-01-01", tipo: "compra", classe: "moeda", ativo: "USD", qtd: 50, valor: 270 }]);
    expect(usd.valorPresente).toBe(280); // 50 dólares a R$ 5,60
  });

  test("títulos de antes das operações viram uma aplicação de saldo inicial com os mesmos dados", () => {
    const titulo: TituloRF = { id: "abc", nome: "LCI Y", tipo: "LCI", idx: "cdi", taxa: 93, aplicado: 8_000, data: "2025-03-01", venc: "", isento: true };
    const [op] = aplicacoesDosTitulosAntigos({ rendaFixa: [titulo] });
    expect(op).toMatchObject({ tipo: "aplicacao", classe: "rf", ativo: "abc", qtd: 8_000, valor: 8_000, inicial: true, data: "2025-03-01" });
    expect(comOperacoes({ rendaFixa: [titulo] }, [op]).rendaFixa).toEqual([{ ...titulo, venc: null, instituicao: null, liquidezDiaria: false }]);
    expect(aplicacoesDosTitulosAntigos({ rendaFixa: [titulo], operacoes: [op] })).toEqual([]);
  });

  test("não mexe em campos que não conhece", () => {
    expect(comOperacoes({ acoesFiis: [], moedas: [{ c: "USD", q: 1 }], campoNovo: 1 }, []).campoNovo).toBe(1);
  });
});
