// Sincronização das quantidades da carteira com as operações
import { describe, expect, test } from "vitest";
import { comOperacoes } from "./operacoes";
import type { Operacao } from "../motor";

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

  test("vendeu tudo, ou apagou todas as operações do ativo: ele sai da carteira", () => {
    const antes = comOperacoes({ acoesFiis: [] }, [compra("ITSA4", 100)]);
    const vendeu = comOperacoes(antes, [...antes.operacoes!, { id: "v", data: "2026-02-01", tipo: "venda", classe: "acao", ativo: "ITSA4", qtd: 100, preco: 11 }]);
    expect(vendeu.acoesFiis).toEqual([]);
    expect(comOperacoes(antes, []).acoesFiis).toEqual([]);
  });

  test("não mexe em campos que não conhece", () => {
    expect(comOperacoes({ acoesFiis: [], moedas: [{ c: "USD", q: 1 }], campoNovo: 1 }, []).campoNovo).toBe(1);
  });
});
