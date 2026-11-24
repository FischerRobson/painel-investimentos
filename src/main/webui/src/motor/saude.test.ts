import { describe, expect, it } from "vitest";
import {
  avaliaFluxos, custoDeVender, distribuicao, escolheAtivos, fgc, fluxosDoAtivo, METAS_PADRAO, notaGeral, planoAporte, reserva,
  sinaisDoAtivo, sinaisRF, sugerirTrocas, vencimentos, xirr, type AtivoAnalisado, type ClasseMeta,
} from "./index";

const vals = (o: Partial<Record<ClasseMeta, number>>) => ({ rf: 0, acao: 0, fii: 0, exterior: 0, cripto: 0, ...o });
// CDI de 0,04% ao dia útil, uma linha por dia corrido (suficiente para os testes)
const cdi = (de: string, ate: string): [string, number][] => {
  const r: [string, number][] = [];
  for (let d = new Date(de + "T12:00:00"); d <= new Date(ate + "T12:00:00"); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) r.push([d.toLocaleDateString("sv-SE"), 0.04]);
  return r;
};

describe("xirr", () => {
  it("acha 10% ao ano em um ano", () => {
    expect(xirr([{ data: "2025-01-01", valor: -1000 }, { data: "2026-01-01", valor: 1100 }])!).toBeCloseTo(10, 1);
  });
  it("sem aporte ou período curto, null", () => {
    expect(xirr([{ data: "2025-01-01", valor: 100 }])).toBeNull();
    expect(xirr([{ data: "2026-01-01", valor: -100 }, { data: "2026-01-10", valor: 101 }])).toBeNull();
  });
});

describe("distribuicao", () => {
  it("calcula desvio e quanto falta aportar sem vender", () => {
    const d = distribuicao(vals({ rf: 50, acao: 50 }), METAS_PADRAO);
    expect(d.total).toBe(100);
    expect(d.linhas.find(l => l.classe === "rf")!.desvio).toBeCloseTo(25);
    // rf está 2× a meta: o total precisa chegar a 200 para as outras classes alcançarem a meta
    expect(d.linhas.find(l => l.classe === "acao")!.falta).toBeCloseTo(20);
    expect(d.linhas.find(l => l.classe === "rf")!.falta).toBe(0);
  });
});

describe("planoAporte", () => {
  it("a reserva vem primeiro", () => {
    const p = planoAporte(1000, vals({ rf: 100, acao: 100, fii: 100 }), METAS_PADRAO, 600);
    expect(p.find(x => x.classe === "rf")!.reserva).toBe(600);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1000);
  });
  it("sem reserva, vai para quem está mais abaixo da meta", () => {
    const p = planoAporte(1000, vals({ rf: 500, acao: 100, fii: 100, exterior: 50, cripto: 50 }), METAS_PADRAO, 0);
    const v = (c: ClasseMeta) => p.find(x => x.classe === c)!.valor;
    expect(v("rf")).toBe(0);
    expect(v("acao")).toBeGreaterThan(v("fii"));
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1000);
  });
  it("tudo na meta divide pelas metas", () => {
    const p = planoAporte(100, vals({ rf: 25, acao: 35, fii: 25, exterior: 10, cripto: 5 }), METAS_PADRAO, 0);
    expect(p.find(x => x.classe === "acao")!.valor).toBeCloseTo(35);
  });
});

describe("escolheAtivos", () => {
  const c = (o: object) => ({ ticker: "A", kind: "fii" as const, nota: 80, preco: 10, peso: 0.05, graves: 0, tem: true, pvp: 0.95, ...o });
  it("descarta nota baixa, alerta grave e concentração", () => {
    const r = escolheAtivos([c({ ticker: "X", nota: 55 }), c({ ticker: "Y", graves: 1 }), c({ ticker: "Z", peso: 0.2 }), c({ ticker: "OK" })], 1000);
    expect(r.map(x => x.ticker)).toEqual(["OK"]);
    expect(r[0].qtd).toBe(100);
  });
  it("divide entre até 3 e respeita o preço da cota", () => {
    const r = escolheAtivos([c({ ticker: "A" }), c({ ticker: "B", nota: 78 }), c({ ticker: "C", nota: 76 }), c({ ticker: "D", nota: 74 })], 300);
    expect(r).toHaveLength(3);
    expect(r.every(x => x.qtd === 10)).toBe(true);
    expect(escolheAtivos([c({ preco: 500 })], 100)).toEqual([]);
  });
});

describe("avaliaFluxos", () => {
  const serie = cdi("2024-01-01", "2026-01-01");
  it("ativo que rendeu menos que o CDI líquido fica abaixo", () => {
    const a = avaliaFluxos([{ data: "2024-01-02", valor: -1000 }], 1050, serie, "2026-01-01");
    expect(a.veredicto).toBe("abaixo");
    expect(a.spread!).toBeLessThan(-2);
    expect(a.vsCdi!).toBeLessThan(0);
    expect(a.ganho).toBe(50);
  });
  it("ativo que rendeu bem mais que o CDI compensa", () => {
    const a = avaliaFluxos([{ data: "2024-01-02", valor: -1000 }], 1800, serie, "2026-01-01");
    expect(a.veredicto).toBe("compensando");
    expect(a.vsCdi!).toBeGreaterThan(0);
  });
  it("proventos contam como retorno", () => {
    const sem = avaliaFluxos([{ data: "2024-01-02", valor: -1000 }], 1000, serie, "2026-01-01");
    const com = avaliaFluxos([{ data: "2024-01-02", valor: -1000 }, { data: "2025-01-02", valor: 300 }], 1000, serie, "2026-01-01");
    expect(com.ganho - sem.ganho).toBe(300);
    expect(com.anual!).toBeGreaterThan(sem.anual!);
  });
  it("posse curta não recebe veredicto", () => {
    expect(avaliaFluxos([{ data: "2025-12-01", valor: -1000 }], 1100, serie, "2026-01-01").veredicto).toBe("cedo");
  });
});

describe("fluxosDoAtivo", () => {
  it("compra, venda e provento; saldo inicial marca incompleto", () => {
    const ops = [
      { id: "1", data: "2025-01-02", tipo: "compra", classe: "acao", ativo: "A", qtd: 10, preco: 10, taxas: 1 },
      { id: "2", data: "2025-06-02", tipo: "venda", classe: "acao", ativo: "A", qtd: 5, preco: 12, taxas: 1 },
      { id: "3", data: "2024-01-02", tipo: "compra", classe: "acao", ativo: "B", qtd: 1, preco: 1, inicial: true },
    ] as never[];
    const r = fluxosDoAtivo(ops, [{ id: "p", data: "2025-07-01", ativo: "A", tipo: "dividendo", valor: 5, irRetido: 1 }], "A");
    expect(r.fluxos.map(f => f.valor)).toEqual([-101, 59, 4]);
    expect(r.incompleto).toBe(false);
    expect(fluxosDoAtivo(ops, [], "B").incompleto).toBe(true);
  });
});

describe("custoDeVender", () => {
  it("ação dentro da isenção, acima dela, FII e prejuízo", () => {
    expect(custoDeVender("acao", 5000, 10000).isento).toBe(true);
    expect(custoDeVender("acao", 5000, 10000, 15000).ir).toBeCloseTo(750);
    expect(custoDeVender("fii", 5000, 10000).ir).toBeCloseTo(1000);
    const p = custoDeVender("acao", 10000, 8000);
    expect(p.prejuizo).toBe(true); expect(p.ir).toBe(0);
  });
});

describe("sinais", () => {
  it("nota baixa persistente é alta; queda de preço sozinha não gera nada", () => {
    const s = sinaisDoAtivo({ ticker: "X", kind: "acao", nota: 30, notasAnteriores: [35], peso: 0.05 });
    expect(s.find(x => x.id === "X-nota")!.severidade).toBe("alta");
    expect(sinaisDoAtivo({ ticker: "Y", kind: "acao", nota: 80, peso: 0.05, av: null })).toEqual([]);
  });
  it("armadilhas de FII e concentração", () => {
    const s = sinaisDoAtivo({ ticker: "F", kind: "fii", nota: 60, peso: 0.2, fund: { dy: 0.18, ffoYield: 0.1, pvp: 0.4 } });
    expect(s.map(x => x.id.split("-").slice(1).join("-")).sort()).toEqual(["dy", "ffo", "peso", "pvp"]);
  });
  it("título prefixado que já rendeu 80% do ganho pede revisão; CDI não", () => {
    const rates = { cdi: cdi("2023-01-01", "2026-06-01"), ipca: [["2025-01-01", 0.4]] as [string, number][] };
    const t = { id: "t", nome: "Pré", tipo: "CDB", idx: "pre" as const, taxa: 12, aplicado: 1000, data: "2023-01-02", venc: "2026-09-01" };
    const hoje = "2026-06-01";
    expect(sinaisRF(t, rates, hoje, 1380).some(x => x.id.endsWith("-80"))).toBe(true);
    expect(sinaisRF({ ...t, idx: "cdi" }, rates, hoje, 1380).some(x => x.id.endsWith("-80"))).toBe(false);
    expect(sinaisRF({ ...t, venc: "2026-07-01" }, rates, hoje, 1380).some(x => x.id.endsWith("-vence"))).toBe(true);
  });
});

describe("sugerirTrocas", () => {
  const base = { kind: "fii" as const, tipoFii: "tijolo" as const, preco: 10, classe: "fii" as const, graves: 0, peso: 0.05 };
  const a: AtivoAnalisado = { ...base, ticker: "FRACO11", nota: 35, dy: 0.06, valor: 10000, custo: 8000, tem: true };
  const b: AtivoAnalisado = { ...base, ticker: "FORTE11", nota: 80, dy: 0.10, valor: 0, custo: 0, tem: false };
  it("sugere o substituto e calcula em quanto tempo a renda extra paga o IR", () => {
    const [t] = sugerirTrocas([a, b]);
    expect(t.para).toBe("FORTE11");
    expect(t.custo.ir).toBeCloseTo(400); // 20% de 2000
    expect(t.anos!).toBeCloseTo(400 / (9600 * 0.10 - 600), 3);
    expect(t.veredicto).toBe("vale");
  });
  it("não sugere quando o substituto não rende mais e a nota pouco muda", () => {
    const [t] = sugerirTrocas([{ ...a, nota: 49, dy: 0.1 }, { ...b, nota: 65, dy: 0.08 }]);
    expect(t.veredicto).toBe("nao-vale");
  });
  it("ignora substituto de outro setor ou com alerta grave", () => {
    const x: AtivoAnalisado = { ...a, kind: "acao", setor: "Energia", classe: "acao" };
    expect(sugerirTrocas([x, { ...x, ticker: "Y", setor: "Bancos", nota: 90, tem: false, valor: 0 }])).toEqual([]);
    expect(sugerirTrocas([a, { ...b, graves: 1 }])).toEqual([]);
  });
});

describe("saúde: reserva, FGC, vencimentos e nota geral", () => {
  it("reserva em meses e o que falta", () => {
    const r = reserva(12000, 3000, 6);
    expect(r.atual).toBe(4); expect(r.falta).toBe(6000); expect(r.nota).toBe(67);
    expect(reserva(1, 0, 6).nota).toBeNull();
  });
  it("FGC soma por instituição, ignora acentos e deixa Tesouro de fora", () => {
    const r = fgc([
      { instituicao: "Banco Pão", tipo: "CDB", valor: 200_000 }, { instituicao: "banco pao", tipo: "LCI", valor: 100_000 },
      { instituicao: "Banco Pão", tipo: "Tesouro Selic", valor: 500_000 }, { tipo: "CDB", valor: 10_000 },
    ]);
    expect(r.linhas).toHaveLength(1);
    expect(r.excesso).toBe(50_000);
    expect(r.semInstituicao).toBe(10_000);
  });
  it("vencimentos por ano", () => {
    const v = vencimentos([{ venc: "2027-05-01", valor: 300 }, { venc: "2027-08-01", valor: 100 }, { venc: "2030-01-01", valor: 100 }, { valor: 50 }]);
    expect(v.maior).toBeCloseTo(0.8); expect(v.semVenc).toBe(1);
  });
  it("nota geral ignora o que não tem dado", () => {
    expect(notaGeral([{ id: "a", nome: "a", nota: 100, peso: 1, resumo: "", acao: null }, { id: "b", nome: "b", nota: null, peso: 9, resumo: "", acao: null }])).toBe(100);
    expect(notaGeral([])).toBeNull();
  });
});
