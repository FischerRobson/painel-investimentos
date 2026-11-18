// Testes do motor financeiro (src/main/resources/META-INF/resources/motor.js). Rodar: node --test .github/scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Motor = require("../../src/main/resources/META-INF/resources/motor.js");
const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test("tabela regressiva do IR", () => {
  assert.equal(Motor.aliqIR(180), 0.225);
  assert.equal(Motor.aliqIR(181), 0.20);
  assert.equal(Motor.aliqIR(360), 0.20);
  assert.equal(Motor.aliqIR(720), 0.175);
  assert.equal(Motor.aliqIR(721), 0.15);
});

test("inflação de equilíbrio: 12% pré × IPCA + 6,5% ≈ 5,16%", () => {
  perto(Motor.ipcaEquilibrio(12, 6.5), 5.164, 0.001);
});

test("no equilíbrio os dois títulos empatam, inclusive depois do IR", () => {
  const eq = Motor.ipcaEquilibrio(12, 6.5);
  const r = Motor.ipcaVsPre({ valor: 10000, anos: 5, pre: 12, real: 6.5, ipca: eq });
  perto(r.pre.bruto, r.ipca.bruto);
  perto(r.pre.liquido, r.ipca.liquido);
  assert.equal(r.vencedor, "empate");
});

test("prefixado 12% por 5 anos: R$ 10.000 viram R$ 17.623 brutos, IR de 15%", () => {
  const r = Motor.ipcaVsPre({ valor: 10000, anos: 5, pre: 12, real: 6.5, ipca: 3 });
  perto(r.pre.bruto, 17623.42);
  perto(r.pre.ir, 7623.42 * 0.15);
  assert.equal(r.vencedor, "pre");
});

test("inflação acima do equilíbrio favorece o IPCA+", () => {
  const r = Motor.ipcaVsPre({ valor: 10000, anos: 5, pre: 12, real: 6.5, ipca: 6 });
  perto(r.ipca.bruto, 10000 * (1.06 * 1.065) ** 5);
  assert.equal(r.vencedor, "ipca");
  assert.ok(r.dif > 0);
});

test("valor real desconta a inflação do período", () => {
  const r = Motor.ipcaVsPre({ valor: 10000, anos: 2, pre: 10, real: 5, ipca: 4 });
  perto(r.pre.real, r.pre.liquido / 1.04 ** 2);
});

test("simulador de aportes: sem rentabilidade, o saldo é a soma dos aportes", () => {
  const s = Motor.simulate({ inicial: 1000, aporte: 100, taxa: 0, inflacao: 0, real: false, meta: 2200, renda: 0 });
  assert.equal(s.rows[12].saldo, 2200);
  assert.equal(s.mMeta, 12);
  assert.equal(s.mRenda, null);
});

test("simulador de aportes: juros compostos mensais equivalentes à taxa anual", () => {
  const s = Motor.simulate({ inicial: 1000, aporte: 0, taxa: 12, inflacao: 4, real: false, meta: 0, renda: 0 });
  perto(s.rows[12].saldo, 1120);
  const real = Motor.simulate({ inicial: 1000, aporte: 0, taxa: 12, inflacao: 4, real: true, meta: 0, renda: 0 });
  perto(real.rows[12].saldo, 1000 * 1.12 / 1.04);
});

test("IPCA acumulado em 12 meses: 12 meses de 1% dão 12,68%", () => {
  const mensal = Array.from({ length: 14 }, (_, i) => ({ date: `2025-${String(i + 1).padStart(2, "0")}-01`, value: 1 }));
  const out = Motor.acumulado12(mensal);
  assert.equal(out.length, 3);
  perto(out[0].value, (1.01 ** 12 - 1) * 100, 1e-9);
  assert.equal(out[0].date, "2025-12-01");
});

test("IPCA acumulado em 12 meses: série curta não gera pontos", () => {
  assert.equal(Motor.acumulado12([{ date: "2025-01-01", value: 1 }]).length, 0);
});

test("CDI diário para anual em base 252", () => {
  perto(Motor.cdiAnual(0.050788), ((1.00050788) ** 252 - 1) * 100, 1e-9);
  perto(Motor.cdiAnual(0), 0);
});

test("juro real: Selic 15% com IPCA 5% dá 9,52% reais", () => {
  perto(Motor.juroReal(15, 5), (1.15 / 1.05 - 1) * 100, 1e-9);
  perto(Motor.juroReal(10, 10), 0, 1e-9);
});

const produtos = [
  { nome: "Pre 12", tipo: "Tesouro Prefixado", idx: "pre", taxa: 12, isento: false, anosVenc: 5 },
  { nome: "IPCA+ 6", tipo: "Tesouro IPCA+", idx: "ipca", taxa: 6, isento: false, anosVenc: 5 },
  { nome: "CDB 110", tipo: "CDB", idx: "cdi", taxa: 110, isento: false, anosVenc: 5 },
  { nome: "LCI 90", tipo: "LCI", idx: "cdi", taxa: 90, isento: true, anosVenc: 5 },
];

test("comparador: prefixado bate com a conta direta e IR de 15% em 5 anos", () => {
  const [pre] = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 4, produtos: [produtos[0]] });
  perto(pre.bruto, 10000 * 1.12 ** 5, 0.01);
  perto(pre.ir, (pre.bruto - 10000) * 0.15, 0.01);
  perto(pre.liquido, pre.bruto - pre.ir, 0.01);
  assert.equal(pre.status, "ok");
});

test("comparador: CDB a 110% do CDI usa a Selic como proxy", () => {
  const [cdb] = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 4, produtos: [produtos[2]] });
  perto(cdb.bruto, 10000 * (1 + 0.10 * 1.10) ** 5, 0.01);
});

test("comparador: LCI é isenta de IR", () => {
  const [lci] = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 4, produtos: [produtos[3]] });
  assert.equal(lci.ir, 0);
  assert.equal(lci.liquido, lci.bruto);
});

test("comparador: IPCA+ depende da inflação do cenário, o prefixado não", () => {
  const a = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 3, produtos })[1];
  const b = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 8, produtos })[1];
  assert.ok(b.bruto > a.bruto);
  const pa = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 3, produtos })[0];
  const pb = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 8, produtos })[0];
  assert.equal(pa.bruto, pb.bruto);
});

test("comparador: vencimento depois do prazo não é comparável; antes reaplica no CDI", () => {
  const longo = { ...produtos[0], anosVenc: 10 };
  const curto = { ...produtos[0], anosVenc: 2 };
  const [l, c] = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 4, produtos: [longo, curto] });
  assert.equal(l.status, "depois");
  assert.equal(l.liquido, null);
  assert.equal(c.status, "antes");
  perto(c.bruto, 10000 * 1.12 ** 2 * 1.10 ** 3, 0.01);
});

test("cenário Focus: média do prazo e o último ano vale para os seguintes", () => {
  const focus = [
    { indicador: "Selic", ano: "2026", mediana: 14, minimo: 13, maximo: 15 },
    { indicador: "Selic", ano: "2027", mediana: 12, minimo: 10, maximo: 14 },
    { indicador: "IPCA", ano: "2026", mediana: 5, minimo: 4, maximo: 6 },
    { indicador: "IPCA", ano: "2027", mediana: 4, minimo: 3, maximo: 7 },
  ];
  const base = Motor.cenarioFocus(focus, 2026, 2, "base");
  perto(base.selic, 13, 1e-9);
  perto(base.ipca, 4.5, 1e-9);
  const longo = Motor.cenarioFocus(focus, 2026, 4, "base");
  perto(longo.selic, (14 + 12 + 12 + 12) / 4, 1e-9);
  assert.equal(Motor.cenarioFocus(focus, 2026, 2, "juros-caem").selic, 11.5);
  assert.equal(Motor.cenarioFocus(focus, 2026, 2, "juros-sobem").selic, 14.5);
  assert.equal(Motor.cenarioFocus(focus, 2026, 2, "inflacao-sobe").ipca, 6.5);
});

// ---------- Marcação a mercado ----------
const base = { qtd: 1, dataCompra: "2025-01-02", dataAnalise: "2026-01-02", dataVenc: "2030-01-01", cdiTaxa: 12, reinvestPct: 100 };

test("dias úteis e corridos", () => {
  assert.equal(Motor.diasUteis("2026-11-13", "2026-11-20"), 5); // sex 13 (excl.) a sex 20
  assert.equal(Motor.diasCorridos("2026-01-01", "2026-01-31"), 30);
});

test("prefixado: sem mudança de taxa, o preço de mercado é o valor na curva", () => {
  const r = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 12 });
  perto(r.puMercado, r.puTeorico, 1e-9);
  perto(r.puTeorico, 900 * 1.12 ** (Motor.diasUteis(base.dataCompra, base.dataAnalise) / 252), 1e-6);
});

test("prefixado: taxa de mercado sobe, preço cai; desce, preço sobe", () => {
  const sobe = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 13 });
  const cai = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 11 });
  assert.ok(sobe.puMercado < sobe.puTeorico);
  assert.ok(cai.puMercado > cai.puTeorico);
});

test("prefixado comprado a PU de vencimento: valor de vencimento é o face de 1.000", () => {
  const du = Motor.diasUteis("2025-01-02", "2030-01-01");
  const puCompra = 1000 / 1.12 ** (du / 252);
  const r = Motor.marcacao({ ...base, dataVenc: "2030-01-01", puCompra, taxaCont: 12, taxaMerc: 12 });
  perto(r.puVenc, 1000, 1e-6);
});

test("IPCA+: correção pelo IPCA entra no valor na curva e no vencimento", () => {
  const r = Motor.marcacao({ ...base, puCompra: 1000, taxaCont: 6, taxaMerc: 6, accrHoje: 1.05, accrVenc: 1.20 });
  perto(r.puTeorico, 1000 * 1.05 * 1.06 ** (Motor.diasUteis(base.dataCompra, base.dataAnalise) / 252), 1e-6);
  perto(r.puVenc, 1000 * 1.06 ** (Motor.diasUteis(base.dataCompra, base.dataVenc) / 252) * 1.20, 1e-6);
});

test("IR da venda: lucro tributado pela alíquota do tempo de compra até hoje", () => {
  const r = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 12 });
  const lucro = r.valorMercado - 900;
  perto(r.irVenda, lucro * 0.175, 1e-6); // 365 dias corridos: faixa de 17,5% (361 a 720 dias)
  perto(r.liqVenda, r.valorMercado - r.irVenda, 1e-9);
});

test("sem prejuízo fiscal: prejuízo na venda não gera IR", () => {
  const r = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 20 });
  assert.equal(r.irVenda, 0);
});

test("data de análise depois do vencimento não é calculada", () => {
  assert.equal(Motor.marcacao({ ...base, dataAnalise: "2031-01-01", puCompra: 900, taxaCont: 12, taxaMerc: 12 }), null);
});

test("fator de IPCA: meses realizados e projeção para os demais", () => {
  const mensal = [{ date: "2025-01-01", value: 1 }, { date: "2025-02-01", value: 2 }];
  const f = Motor.fatorIpcaPeriodo(mensal, "2025-01-15", "2025-04-01", 12);
  // jan (1%) e fev (2%) realizados; mar projetado a 12% a.a. (≈ 0,949% no mês)
  perto(f, 1.01 * 1.02 * 1.12 ** (1 / 12), 1e-9);
  perto(Motor.fatorIpcaPeriodo([], "2025-01-01", "2026-01-01", 10), 1.10, 1e-9);
});
